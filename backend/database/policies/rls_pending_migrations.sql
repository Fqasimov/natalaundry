-- Policies for tables that DO NOT YET EXIST in production.
--
-- ===========================================================================
-- DO NOT RUN THIS YET.
-- ===========================================================================
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
-- Order of operations:
--   1. php artisan migrate --pretend      (review, against production)
--   2. reconcile orders.reward_id, which already exists live while no rewards
--      table does — see SCHEMA_NOTES.md "Still unresolved"
--   3. run the migrations
--   4. run this file
--   5. re-run rls_audit.sql query 3 and confirm rls_enabled = true on all
--
-- Until step 3, the app features that read these tables cannot work against
-- production at all: courier job offers, live tracking, the order timeline,
-- gift boxes, and promo codes.

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
