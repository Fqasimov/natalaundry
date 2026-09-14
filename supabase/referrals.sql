-- Referrals: a friend signs up with your code, you both get ₼5.
--
-- Two rules shape this.
--
-- 1. **The code is derived, not stored.** lib/referrals.ts turns a profile id
--    into an 8-character code, and `referral_code_for(uuid)` below is the same
--    function in SQL. Nothing has to be generated, reserved or migrated, and a
--    code shared months ago still resolves to the same account.
--
-- 2. **Neither side is paid at signup.** The friend's ₼5 lands when they sign
--    up; the referrer's ₼5 lands only once that friend has actually paid for
--    an order. Paying the referrer at signup would make free e-mail addresses
--    into free money.
--
-- Ledger writes go through wallet_transactions, which `sync_wallet_balance`
-- turns into the balance — the app never forms its own opinion of it.

-- ── the code ────────────────────────────────────────────────────────────────
-- Mirrors referralCodeFor() in lib/referrals.ts: FNV-1a over "<id>:<i>",
-- advanced per character, indexed into an alphabet with no 0/O/1/I/5/S because
-- a referral code gets read aloud and typed by someone who did not choose it.
create or replace function public.referral_code_for(p_id uuid)
returns text
language plpgsql
immutable
as $$
declare
  alphabet constant text := '2346789ABCDEFGHJKLMNPQRTUVWXYZ';
  h bigint;
  out_code text := '';
  seed text;
  i int;
  c int;
begin
  if p_id is null then
    return null;
  end if;

  h := 2166136261;                         -- 0x811c9dc5, seeded once
  for i in 0..7 loop
    seed := p_id::text || ':' || i::text;
    for c in 1..length(seed) loop
      h := (h # ascii(substr(seed, c, 1)))::bigint;
      h := (h * 16777619) & 4294967295;    -- * 0x01000193, truncated to 32 bits
    end loop;
    out_code := out_code || substr(alphabet, (h % length(alphabet))::int + 1, 1);
  end loop;

  return out_code;
end;
$$;

-- ── the table ───────────────────────────────────────────────────────────────
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  -- One row per referred account: a person can be referred once, ever.
  referred_id uuid not null unique references public.profiles(id) on delete cascade,
  code text not null,
  status text not null default 'joined' check (status in ('joined', 'completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  -- Nobody refers themselves.
  constraint referrals_not_self check (referrer_id <> referred_id)
);

create index if not exists referrals_referrer_idx on public.referrals (referrer_id, created_at desc);

-- A new table arrives with RLS off and PostgREST exposes it immediately.
alter table public.referrals enable row level security;

drop policy if exists "referrals are visible to the referrer" on public.referrals;
create policy "referrals are visible to the referrer"
  on public.referrals for select
  using (auth.uid() = referrer_id or auth.uid() = referred_id);

-- Writes come from the SECURITY DEFINER functions below only.
revoke insert, update, delete on public.referrals from anon, authenticated;

-- ── redeeming, at signup ────────────────────────────────────────────────────
-- Called from the trigger that creates a profile, reading the code out of the
-- signup metadata. It is not callable by a client: a referral must be claimed
-- as part of creating the account, not afterwards by anyone who fancies it.
create or replace function public.redeem_referral_for(p_profile_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(nullif(trim(p_code), ''));
  v_referrer uuid;
  v_bonus constant numeric(10,2) := 5.00;
begin
  if v_code is null then
    return;
  end if;

  -- Already referred? First claim stands.
  if exists (select 1 from public.referrals where referred_id = p_profile_id) then
    return;
  end if;

  select id into v_referrer
  from public.profiles
  where public.referral_code_for(id) = v_code
    and id <> p_profile_id
  limit 1;

  if v_referrer is null then
    return;                                -- an unknown code is simply ignored
  end if;

  insert into public.referrals (referrer_id, referred_id, code, status)
  values (v_referrer, p_profile_id, v_code, 'joined')
  on conflict (referred_id) do nothing;

  -- The friend is paid now; the referrer waits for a real order.
  insert into public.wallet_transactions (user_id, amount, kind, note)
  values (p_profile_id, v_bonus, 'referral', 'referral_joined:' || p_profile_id);
end;
$$;

revoke all on function public.redeem_referral_for(uuid, text) from public, anon, authenticated;

-- ── completing, on the friend's first paid order ────────────────────────────
create or replace function public.complete_referral_on_paid_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref public.referrals;
  v_bonus constant numeric(10,2) := 5.00;
begin
  -- Only on the transition into paid, which makes this idempotent: a second
  -- update that leaves payment_status alone does not re-run it.
  if new.payment_status is distinct from 'paid'
     or old.payment_status is not distinct from 'paid' then
    return new;
  end if;

  select * into v_ref
  from public.referrals
  where referred_id = new.user_id and status = 'joined'
  for update;

  if not found then
    return new;
  end if;

  update public.referrals
  set status = 'completed', completed_at = now()
  where id = v_ref.id;

  insert into public.wallet_transactions (user_id, amount, kind, note)
  values (v_ref.referrer_id, v_bonus, 'referral', 'referral_completed:' || v_ref.id);

  return new;
end;
$$;

drop trigger if exists trg_complete_referral on public.orders;

create trigger trg_complete_referral
  after update of payment_status on public.orders
  for each row
  execute function public.complete_referral_on_paid_order();

revoke all on function public.complete_referral_on_paid_order() from public, anon, authenticated;

-- ── hooking redemption into profile creation ────────────────────────────────
-- The profile row is created from auth.users after the address is confirmed,
-- so the code travels as signup metadata (see lib/auth-context.tsx) and is
-- consumed here. An unconfirmed signup therefore cannot claim anything.
create or replace function public.claim_referral_on_new_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_code text;
begin
  select raw_user_meta_data ->> 'referral_code'
  into v_code
  from auth.users
  where id = new.id;

  if v_code is not null then
    perform public.redeem_referral_for(new.id, v_code);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_claim_referral on public.profiles;

create trigger trg_claim_referral
  after insert on public.profiles
  for each row
  execute function public.claim_referral_on_new_profile();

revoke all on function public.claim_referral_on_new_profile() from public, anon, authenticated;

-- ── the two implementations must agree ──────────────────────────────────────
-- referral_code_for() above and referralCodeFor() in lib/referrals.ts derive
-- the same code independently. If they ever drift, a code shared from the app
-- resolves to nobody here and the referral silently does nothing — which looks
-- like the friend simply never used it.
--
-- These vectors come from the TypeScript. Applying this file checks them, so
-- a drift fails here rather than in production months later.
do $$
declare
  expected constant text[][] := array[
    ['11111111-1111-1111-1111-111111111111', '6BHVAKFT'],
    ['a3f2c8d1-4b5e-4a6f-9c8d-7e1f2a3b4c5d', '3RP8V943']
  ];
  got text;
  i int;
begin
  for i in 1..array_length(expected, 1) loop
    got := public.referral_code_for(expected[i][1]::uuid);
    if got is distinct from expected[i][2] then
      raise exception
        'referral_code_for(%) gave % but lib/referrals.ts gives % — the two derivations have drifted',
        expected[i][1], got, expected[i][2];
    end if;
  end loop;
end;
$$;
