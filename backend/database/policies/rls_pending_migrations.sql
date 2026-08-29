-- ===========================================================================
-- APPLIED 2026-08-27. This file is now a record, not a to-do.
-- ===========================================================================
-- Both migrations were run against production and every statement below was
-- applied, in two transactions (the courier/lifecycle half first, then the
-- gift-box half once those tables existed). `rls_audit.sql` query 3 now
-- returns rowsecurity = true for all 19 tables in public.
--
-- One table is missing from this file and had to be handled separately:
-- Laravel creates its own `migrations` table in `public`, which Supabase
-- exposes through PostgREST like any other. RLS was enabled and all grants
-- revoked on it by hand.
--
-- Re-running this file is safe and idempotent.
--
-- The original header follows, for the reasoning it records.
--
-- ---------------------------------------------------------------------------
-- Policies for tables that DID NOT EXIST in production.
-- ---------------------------------------------------------------------------
-- Every table below is created by a migration that has never been applied to
-- the live database. Confirmed 2026-08-25: rls_audit.sql query 3 listed the
-- full contents of the `public` schema, and none of these appeared.
--
--   From 2026_08_20_094021_create_gift_box_tables.php
--     rewards, user_rewards, gift_box_openings, promo_codes
--
--   From 2026_08_21_000001_add_order_lifecycle_tables.php
--     order_status_logs, courier_assignments, courier_locations
--
-- Naming a missing table aborts the transaction and applies nothing — the
-- exact failure that made the original rls.sql a no-op. So this file is kept
-- separate from rls_v2.sql rather than merged into it.
--
-- Order of operations (all done):
--   1. php artisan migrate --pretend      (review, against production)
--   2. reconcile orders.reward_id
--   3. run the migrations
--   4. run this file
--   5. re-run rls_audit.sql query 3 and confirm rls_enabled = true on all
--
-- On step 2: the reconciliation turned out to be a non-issue. NEITHER
-- migration declares a foreign key against `rewards`. `orders.reward_id` is a
-- bare nullable uuid with no constraint on it, so there was no FK that could
-- fail to line up — the warning was over-cautious.
--
-- Note the gap between steps 3 and 4 is a live security hole: a table created
-- in `public` is exposed through PostgREST immediately, and the anon key ships
-- inside the app bundle. Run step 4 in the same sitting, not the next day.

begin;

-- ---------------------------------------------------------------------------
-- order_status_logs — the lifecycle timeline
-- ---------------------------------------------------------------------------
alter table public.order_status_logs enable row level security;
revoke all on public.order_status_logs from anon;
revoke insert, update, delete on public.order_status_logs from authenticated;

drop policy if exists "Read timeline of visible orders" on public.order_status_logs;
create policy "Read timeline of visible orders" on public.order_status_logs
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_status_logs.order_id
      and (o.user_id = (select auth.uid()) or o.courier_id = (select auth.uid()))
  ));

-- ---------------------------------------------------------------------------
-- courier_assignments — the dispatch pool
-- ---------------------------------------------------------------------------
-- A courier sees only their own offers; the pool leaks every address in it.
alter table public.courier_assignments enable row level security;
revoke all on public.courier_assignments from anon;
revoke insert, update, delete on public.courier_assignments from authenticated;

drop policy if exists "Couriers read own assignments" on public.courier_assignments;
create policy "Couriers read own assignments" on public.courier_assignments
  for select to authenticated
  using (courier_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- courier_locations — live GPS
-- ---------------------------------------------------------------------------
-- A courier's position is personal data. Visible only while the order is
-- actually moving, so the trail closes on delivery rather than staying open.
alter table public.courier_locations enable row level security;
revoke all on public.courier_locations from anon;
revoke insert, update, delete on public.courier_locations from authenticated;

drop policy if exists "Read positions for my in-flight order" on public.courier_locations;
create policy "Read positions for my in-flight order" on public.courier_locations
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = courier_locations.order_id
      and (o.user_id = (select auth.uid()) or o.courier_id = (select auth.uid()))
      and o.lifecycle_state in ('courier_en_route_pickup', 'courier_en_route_delivery')
  ));

-- ---------------------------------------------------------------------------
-- rewards / user_rewards / gift_box_openings
-- ---------------------------------------------------------------------------
-- The prize catalogue is readable: the app shows what a box can contain.
-- Draw weights sit in the same table, which is fine — knowing the odds does
-- not change them, and the draw happens server-side.
alter table public.rewards enable row level security;
revoke all on public.rewards from anon;
revoke insert, update, delete on public.rewards from authenticated;

drop policy if exists "Anyone signed in reads active rewards" on public.rewards;
create policy "Anyone signed in reads active rewards" on public.rewards
  for select to authenticated
  using (active = true);

-- A won prize is money-adjacent: used_at is what stops it being spent twice,
-- so the app must never be able to write it.
alter table public.user_rewards enable row level security;
revoke all on public.user_rewards from anon;
revoke insert, update, delete on public.user_rewards from authenticated;

drop policy if exists "Users read own rewards" on public.user_rewards;
create policy "Users read own rewards" on public.user_rewards
  for select to authenticated
  using (user_id = (select auth.uid()));

alter table public.gift_box_openings enable row level security;
revoke all on public.gift_box_openings from anon;
revoke insert, update, delete on public.gift_box_openings from authenticated;

drop policy if exists "Users read own openings" on public.gift_box_openings;
create policy "Users read own openings" on public.gift_box_openings
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- promo_codes — deliberately unreadable
-- ---------------------------------------------------------------------------
-- No select policy at all. Listing this table would hand every customer every
-- unpublished discount code, including single-campaign ones. Validation
-- happens in PromoService, server-side, one code at a time.
alter table public.promo_codes enable row level security;
revoke all on public.promo_codes from anon, authenticated;

commit;
