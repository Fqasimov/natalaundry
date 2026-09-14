-- Nata Balance top-up bonus: +5% from ₼100, +10% from ₼200.
--
-- Credited by a trigger on `wallet_topups` rather than inside
-- `settle_bank_order`, for two reasons. First, it fires only on the
-- transition into settled, which makes it idempotent for free: the callback,
-- the app's poll and any reconciliation can all settle the same row, and only
-- the update that actually flips `settled_at` runs this. Second, it leaves the
-- settlement function alone — that function decides whether money arrived, and
-- this decides what we add on top; they are separate questions.
--
-- The amount is read from the row, which holds what the bank confirmed. No
-- figure from a client reaches this. lib/wallet.ts carries a display-only copy
-- of the same tiers so checkout can show the bonus before paying; if you change
-- the thresholds here, change them there and in backend/config/nata.php too.

create or replace function public.credit_topup_bonus()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bonus numeric(10,2);
begin
  -- Only on the transition into settled, and only when it actually paid.
  if new.settled_at is null or old.settled_at is not null or new.status <> 'paid' then
    return new;
  end if;

  bonus := case
    when new.amount >= 200 then round(new.amount * 0.10, 2)
    when new.amount >= 100 then round(new.amount * 0.05, 2)
    else 0
  end;

  if bonus <= 0 then
    return new;
  end if;

  -- A second belt: if a bonus row already exists for this top-up, do nothing.
  -- The transition guard above should make this unreachable, but this is money
  -- and the cost of being sure is one index lookup.
  if exists (
    select 1 from public.wallet_transactions
    where user_id = new.user_id and kind = 'bonus' and note = 'topup_bonus:' || new.id
  ) then
    return new;
  end if;

  insert into public.wallet_transactions (user_id, amount, kind, note)
  values (new.user_id, bonus, 'bonus', 'topup_bonus:' || new.id);

  return new;
end;
$$;

drop trigger if exists trg_credit_topup_bonus on public.wallet_topups;

create trigger trg_credit_topup_bonus
  after update of settled_at on public.wallet_topups
  for each row
  execute function public.credit_topup_bonus();

-- The function writes the ledger, so only the trigger may call it.
revoke all on function public.credit_topup_bonus() from public, anon, authenticated;
