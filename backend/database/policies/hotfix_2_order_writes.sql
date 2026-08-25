-- URGENT #2: the client can still write its own orders and prices.
--
-- Found 2026-08-25 in rls_audit.sql query 2, against production.
--
-- SECURITY.md records "The client set its own prices" as FIXED. That fix was
-- only ever made in the app — checkout was rerouted through the Laravel API so
-- the server prices the basket. The database was never changed, and it still
-- carries the policies that made the original bug possible:
--
--   orders      | "Users can insert their own orders"      | INSERT
--               |   with check (auth.uid() = user_id)
--   order_items | "Users can insert their own order items" | INSERT
--               |   with check (order belongs to auth.uid())
--
-- Those check only WHOSE order it is. They say nothing about the values in it.
-- Anyone with the app's anon key can therefore POST directly to PostgREST and
-- insert an order with total = 0.01, or line items priced at zero, bypassing
-- OrderService entirely. Rerouting the app did not close the hole; it only
-- stopped the app from walking through it.
--
-- Also fixed here:
--
--   orders | "Couriers can update orders" | UPDATE | WITH CHECK = null
--
-- With no WITH CHECK, Postgres reuses the USING expression as the check. That
-- expression constrains only courier_id, status and the caller's role — so a
-- courier updating a pending unassigned order may rewrite every other column
-- in the same statement, `total` included, and the row still satisfies the
-- policy afterwards.
--
--   profiles | "Users can view and edit their own profiles" | ALL
--
-- `ALL` covers DELETE. A customer can delete their own profile row, orphaning
-- their orders. It is replaced below with explicit SELECT and UPDATE policies,
-- which is what the app actually needs. (The column grant from
-- hotfix_profiles_grant.sql already limits which columns that UPDATE can
-- touch; this narrows which *commands* are allowed at all.)
--
-- ---------------------------------------------------------------------------
-- Safe for the app. Every one of these writes already goes through the API:
--   createOrder / createTopluOrder  -> POST /api/orders
--   cancelOrder                     -> POST /api/orders/{id}/cancel
--   claimOrder / advanceOrderStatus -> POST /api/orders/{id}/...
--   transitionOrder                 -> POST /api/orders/{id}/lifecycle/...
-- The API connects as the table owner and is unaffected by policies.
--
-- The only direct writes the app still makes are profiles(name, phone) and
-- notifications(read). Both are preserved.
-- ---------------------------------------------------------------------------

begin;

-- ---------------------------------------------------------------------------
-- orders — no client writes at all
-- ---------------------------------------------------------------------------
drop policy if exists "Users can insert their own orders" on public.orders;
drop policy if exists "Couriers can update orders" on public.orders;
drop policy if exists "Couriers update assigned orders" on public.orders;
drop policy if exists "Users can cancel their own pending orders." on public.orders;

-- Belt and braces: even with no policy, a grant would still be needed, and
-- revoking it means a future permissive policy cannot silently re-open this.
revoke insert, update, delete on public.orders from anon, authenticated;

-- ---------------------------------------------------------------------------
-- order_items — same
-- ---------------------------------------------------------------------------
drop policy if exists "Users can insert their own order items" on public.order_items;
revoke insert, update, delete on public.order_items from anon, authenticated;

-- ---------------------------------------------------------------------------
-- profiles — replace the blanket ALL policy
-- ---------------------------------------------------------------------------
-- Dropped and rebuilt in the same transaction so read access is never lost.
-- The two courier/customer visibility policies
-- ("Couriers can view their assigned customer",
--  "Customers can view their assigned courier profile") are left alone —
-- they already provide handover visibility via is_assigned_courier_for().
drop policy if exists "Users can view and edit their own profiles" on public.profiles;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No INSERT policy: rows are created by the auth trigger on signup.
-- No DELETE policy: accounts are removed through Supabase Auth.
revoke insert, delete on public.profiles from anon, authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Verify afterwards
-- ---------------------------------------------------------------------------
-- 1. Place an order in the app. It must still work — it goes via the API.
-- 2. Edit name/phone on the profile screen. Must still work.
-- 3. Mark a notification read. Must still work.
-- 4. Re-run rls_audit.sql query 2 and confirm orders has no INSERT/UPDATE
--    policy left, and profiles no longer has a policy with cmd = ALL.
--
-- Rollback for any single policy is to recreate it from the query 2 output
-- captured in SECURITY.md.
