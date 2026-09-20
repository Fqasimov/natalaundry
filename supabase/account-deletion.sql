-- Account deletion, required by Google Play policy and Apple Guideline 5.1.1(v)
-- for any app that lets someone create an account.
--
-- ── why this is not a DELETE ────────────────────────────────────────────────
--
-- The obvious implementation — delete the auth user and let the cascades run —
-- destroys the business's accounting records. The chain is:
--
--     auth.users  --CASCADE-->  profiles  --CASCADE-->  orders
--                                         --CASCADE-->  payment_intents
--                                         --CASCADE-->  wallet_transactions
--
-- Deleting one customer would take their orders, the money they paid and the
-- ledger that explains their balance with them. Eighteen orders exist against
-- fifteen accounts; losing a customer's history is not a privacy improvement,
-- it is a hole in the books, and both stores' policies explicitly permit
-- retaining what is needed for financial record-keeping.
--
-- So deletion here means: **the person is erased, the transactions are kept.**
--
--   * the auth.users row is deleted outright, which cascades sessions,
--     identities, refresh tokens and one-time tokens. The credentials are
--     genuinely gone — no password to try, no OAuth link, no way back in, and
--     the e-mail address is freed for a new signup.
--   * the profiles row survives as a tombstone carrying no personal data:
--     no name, no phone, no e-mail, no push token, no birthday.
--   * orders keep their amounts, dates and line items, and lose the address,
--     the coordinates and the delivery notes — everything that says *where a
--     person lives*.
--
-- The tombstone is what keeps every foreign key valid, which is why the FK
-- from profiles to auth.users has to go: it is the one constraint that cannot
-- express "the parent is gone, the child remains" (profiles.id is the primary
-- key, so ON DELETE SET NULL is not available). After this, the integrity of
-- profiles.id rests on handle_new_user() being the only thing that inserts
-- there, which it already is.
--
-- ── what this does NOT do ───────────────────────────────────────────────────
--
-- Google also requires a *web* route to request deletion, reachable without
-- installing the app. That is a page on natalaundry.az, not SQL, and it is
-- still outstanding — see ACTIONS.md.
--
-- Safe to run more than once.

begin;

-- ── 1. the tombstone marker ─────────────────────────────────────────────────
alter table public.profiles
  add column if not exists deleted_at timestamptz;

comment on column public.profiles.deleted_at is
  'Set by delete_my_account(). The auth user is gone; this row is a tombstone '
  'retained only so orders and payments keep a valid foreign key. It holds no '
  'personal data.';

-- ── 2. let the tombstone outlive the auth user ──────────────────────────────
-- Looked up by catalogue rather than by name: this constraint is Supabase's
-- own, and its name has changed between projects before.
do $$
declare
  v_name text;
begin
  select c.conname into v_name
    from pg_constraint c
   where c.conrelid = 'public.profiles'::regclass
     and c.contype = 'f'
     and c.confrelid = 'auth.users'::regclass;

  if v_name is not null then
    execute format('alter table public.profiles drop constraint %I', v_name);
    raise notice 'dropped profiles -> auth.users foreign key (%)', v_name;
  end if;
end;
$$;

-- ── 3. the deletion itself ──────────────────────────────────────────────────
-- SECURITY DEFINER because deleting from auth.users is not something the
-- `authenticated` role can be granted directly, and because the tombstone has
-- to be written past the RLS policy that only permits a user to update their
-- own *live* profile.
--
-- It takes no arguments on purpose. An id parameter would be an invitation to
-- pass someone else's, and every guard below would then have to be written
-- against that argument rather than against the caller. auth.uid() cannot be
-- spoofed by the client: it is read from the verified JWT.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
  v_open int;
begin
  if v_uid is null then
    raise exception 'ACCOUNT_DELETE_NOT_SIGNED_IN';
  end if;

  select role into v_role from public.profiles where id = v_uid;

  if v_role is null then
    raise exception 'ACCOUNT_DELETE_NO_PROFILE';
  end if;

  -- Staff accounts are not self-serve. A courier who deletes themselves
  -- mid-shift strands whatever they are carrying, and an admin doing it by
  -- accident cannot be undone. The store requirement is about the customer
  -- accounts the app creates, which these are not.
  if v_role <> 'user' then
    raise exception 'ACCOUNT_DELETE_STAFF';
  end if;

  -- An order in flight means a courier is holding this person's clothes and
  -- may need to phone them. Deleting the contact details mid-delivery breaks a
  -- delivery that is already paid for. This blocks only until the order
  -- reaches a terminal state, and the app says so plainly.
  select count(*) into v_open
    from public.orders
   where user_id = v_uid
     and lifecycle_state not in ('delivered', 'cancelled');

  if v_open > 0 then
    raise exception 'ACCOUNT_DELETE_ACTIVE_ORDER';
  end if;

  -- Personal records that serve no accounting purpose. These go entirely.
  delete from public.notifications      where user_id = v_uid;
  delete from public.gift_box_openings  where user_id = v_uid;
  delete from public.user_rewards       where user_id = v_uid;
  delete from public.referrals          where referrer_id = v_uid or referred_id = v_uid;
  delete from public.customer_details   where id = v_uid;

  -- Orders are kept, but stripped of everything that locates a person. The
  -- money, the dates and the line items — what the books actually need —
  -- are untouched.
  update public.orders
     set address     = null,
         address_lat = null,
         address_lng = null,
         notes       = null
   where user_id = v_uid;

  -- The tombstone. wallet_balance, subscription_expires_at and role are
  -- deliberately not touched: guard_wallet_and_subscription() and
  -- prevent_role_escalation() both raise when auth.uid() is set, and it is set
  -- here — SECURITY DEFINER changes the executing role, not the JWT claims.
  update public.profiles
     set name          = 'Silinmiş hesab',
         phone         = null,
         email         = null,
         push_token    = null,
         birthday      = null,
         last_active_at = null,
         deleted_at    = now()
   where id = v_uid;

  -- Last, because it is the irreversible half. Cascades auth.sessions,
  -- auth.identities, auth.refresh_tokens and auth.one_time_tokens.
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'Deletes the calling user''s auth account and erases their personal data, '
  'keeping order and payment records as an anonymous tombstone. Required by '
  'Google Play and App Store account-deletion policy.';

commit;

-- ── verification ────────────────────────────────────────────────────────────
-- Fails loudly on application rather than reporting success and changing
-- nothing, which is how a previous migration in this project went wrong.
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and contype = 'f'
       and confrelid = 'auth.users'::regclass
  ) then
    raise exception 'profiles still has a foreign key to auth.users';
  end if;

  if not exists (
    select 1 from pg_proc
     where proname = 'delete_my_account'
       and pronamespace = 'public'::regnamespace
       and prosecdef
  ) then
    raise exception 'delete_my_account() is missing or not SECURITY DEFINER';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'deleted_at'
  ) then
    raise exception 'profiles.deleted_at is missing';
  end if;

  raise notice 'account deletion installed';
end;
$$;
