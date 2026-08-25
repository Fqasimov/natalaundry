-- Row Level Security — the tables that actually exist in production.
--
-- Supersedes rls.sql. Reconciled against the live schema on 2026-08-25
-- (rls_audit.sql query 3), which listed exactly eleven tables in `public`:
--
--   courier_details, customer_details, notifications, order_items,
--   order_offers, orders, payment_intents, payments, profiles,
--   service_prices, wallet_transactions
--
-- RLS is already enabled on all eleven. This file therefore does not enable
-- it anywhere; it fixes *grants* and *policies*, which is where the gap is.
--
-- Seven tables the earlier draft covered DO NOT EXIST in production:
--   order_status_logs, courier_assignments, courier_locations,
--   rewards, user_rewards, gift_box_openings, promo_codes
-- They come from two migrations that have never been run against the live
-- database. Their policies live in rls_pending_migrations.sql — run that only
-- after the migrations, or this script's failure mode repeats: naming a
-- missing object aborts the transaction and applies nothing.
--
-- ===========================================================================
-- STILL OUTSTANDING: rls_audit.sql query 2.
-- ===========================================================================
-- `orders` reports EIGHT policies and `courier_details` SIX. This file cannot
-- know their names, and DROP POLICY IF EXISTS only drops names it knows.
-- Permissive policies are OR'd, so one pre-existing loose policy — say
-- "Enable read access for all users" — keeps everything open no matter what
-- is added here. Read query 2 output and drop those explicitly before
-- trusting this file.
--
-- Design note: writes that decide money or state go through the Laravel API,
-- which connects as the table owner and bypasses RLS entirely. These policies
-- only describe what the *phone app* may do directly, and the correct answer
-- is almost always "read your own rows, write nothing".
--
-- Every auth.uid() is wrapped as (select auth.uid()): Postgres evaluates the
-- subselect once as an InitPlan rather than once per candidate row.

begin;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- The column grant here was already applied as hotfix_profiles_grant.sql on
-- 2026-08-25, closing a confirmed live escalation. Repeated for completeness;
-- re-running it is harmless.
revoke update on public.profiles from anon;
revoke update on public.profiles from authenticated;
grant update (name, phone, language, birthday, last_active_at, push_token)
  on public.profiles to authenticated;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

-- Courier and customer on an active order need each other's name and phone to
-- complete a handover. Narrow, and closes when the order finishes.
drop policy if exists "Counterparty on an active order" on public.profiles;
create policy "Counterparty on an active order" on public.profiles
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.status in ('pending', 'collecting', 'cleaning', 'delivering')
      and (
        (o.user_id    = (select auth.uid()) and o.courier_id = profiles.id)
        or
        (o.courier_id = (select auth.uid()) and o.user_id    = profiles.id)
      )
  ));

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
-- NOTE: `lifecycle_state` is referenced by the app but the lifecycle tables do
-- not exist in production, so this policy is written against `status`, which
-- the audit confirms is the live column set. Revisit after the lifecycle
-- migration runs.
revoke all on public.orders from anon;
revoke insert, update, delete on public.orders from authenticated;

drop policy if exists "Users read own orders" on public.orders;
create policy "Users read own orders" on public.orders
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or courier_id = (select auth.uid())
  );

-- Couriers browse unassigned work. Kept separate and narrow: it exposes
-- pickup addresses, so it is limited to the pending, unclaimed pool and to
-- callers whose profile actually says courier.
drop policy if exists "Couriers read the unclaimed pool" on public.orders;
create policy "Couriers read the unclaimed pool" on public.orders
  for select to authenticated
  using (
    status = 'pending'
    and courier_id is null
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'courier'
    )
  );

-- ---------------------------------------------------------------------------
-- order_items
-- ---------------------------------------------------------------------------
revoke all on public.order_items from anon;
revoke insert, update, delete on public.order_items from authenticated;

drop policy if exists "Read items of visible orders" on public.order_items;
create policy "Read items of visible orders" on public.order_items
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and (o.user_id = (select auth.uid()) or o.courier_id = (select auth.uid()))
  ));

-- ---------------------------------------------------------------------------
-- order_offers
-- ---------------------------------------------------------------------------
-- Exists in production and was missed by the earlier draft. Courier bidding:
-- a courier must see only their own offers, since the pool leaks addresses.
revoke all on public.order_offers from anon;
revoke insert, update, delete on public.order_offers from authenticated;

drop policy if exists "Couriers read own offers" on public.order_offers;
create policy "Couriers read own offers" on public.order_offers
  for select to authenticated
  using (courier_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
-- The one table the app writes directly, because marking your own
-- notification read decides nothing. The grant keeps it to that one column so
-- the body and its order reference cannot be rewritten.
revoke all on public.notifications from anon;
revoke insert, update, delete on public.notifications from authenticated;
grant update (read) on public.notifications to authenticated;

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications" on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users mark own notifications read" on public.notifications;
create policy "Users mark own notifications read" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- payments / payment_intents — money
-- ---------------------------------------------------------------------------
-- Read-only, own rows only. Every write comes from PaymentService server-side.
-- A client that could insert a payment row could mark an order paid without
-- paying for it.
revoke all on public.payments from anon;
revoke insert, update, delete on public.payments from authenticated;

drop policy if exists "Users read own payments" on public.payments;
create policy "Users read own payments" on public.payments
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = payments.order_id and o.user_id = (select auth.uid())
  ));

revoke all on public.payment_intents from anon;
revoke insert, update, delete on public.payment_intents from authenticated;

drop policy if exists "Users read own payment intents" on public.payment_intents;
create policy "Users read own payment intents" on public.payment_intents
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- wallet_transactions — the balance ledger
-- ---------------------------------------------------------------------------
-- profiles.wallet_balance is the authoritative balance and this is its ledger.
-- Insert rights would let a customer credit themselves.
revoke all on public.wallet_transactions from anon;
revoke insert, update, delete on public.wallet_transactions from authenticated;

drop policy if exists "Users read own wallet ledger" on public.wallet_transactions;
create policy "Users read own wallet ledger" on public.wallet_transactions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- customer_details / courier_details
-- ---------------------------------------------------------------------------
-- customer_details holds stripe_customer_id; courier_details holds a courier's
-- live coordinates. Owner-only.
--
-- courier_details reports SIX existing policies — check query 2 before
-- assuming this narrows anything.
revoke all on public.customer_details from anon;
revoke insert, update, delete on public.customer_details from authenticated;

drop policy if exists "Users read own customer details" on public.customer_details;
create policy "Users read own customer details" on public.customer_details
  for select to authenticated
  using (id = (select auth.uid()));

revoke all on public.courier_details from anon;
revoke insert, update, delete on public.courier_details from authenticated;

drop policy if exists "Couriers read own details" on public.courier_details;
create policy "Couriers read own details" on public.courier_details
  for select to authenticated
  using (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- service_prices — the public catalogue
-- ---------------------------------------------------------------------------
-- Readable by design; writes are not.
revoke insert, update, delete on public.service_prices from anon, authenticated;

drop policy if exists "Anyone can read active prices" on public.service_prices;
create policy "Anyone can read active prices" on public.service_prices
  for select to anon, authenticated
  using (active = true);

commit;

-- ---------------------------------------------------------------------------
-- After running: re-run rls_audit.sql query 4 and confirm no `anon` row
-- carries INSERT / UPDATE / DELETE on any table.
-- ---------------------------------------------------------------------------
