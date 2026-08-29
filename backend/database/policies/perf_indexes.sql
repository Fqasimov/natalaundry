-- Index coverage for the queries the app actually runs at scale.
--
-- Found 2026-08-27 by auditing pg_indexes against the hot paths. Four of the
-- most-called queries in the system have no index behind them at all and are
-- doing sequential scans. At 15 orders that is invisible. At 50,000 it is the
-- difference between 1 ms and a table scan on every screen the customer opens.
--
--   orders.user_id       — GET /api/orders, every customer, every app open
--   orders.courier_id    — the courier's own job list
--   order_items.order_id — every order detail load, and this is the table that
--                          grows fastest (one row per garment)
--   payments.order_id    — every payment status check and every bank callback
--
-- CONCURRENTLY so none of these take a write lock on a live table. That means
-- each statement must run OUTSIDE a transaction — the Supabase SQL editor
-- wraps a multi-statement script in one, so run these ONE AT A TIME, or from
-- psql. A failed CONCURRENTLY build leaves an INVALID index behind; drop it
-- and retry rather than leaving it in place.
--
-- Verify afterwards with the plan check at the bottom: it must say Index Scan,
-- not Seq Scan.

-- The customer's order list. Ordered by created_at, so the index covers both
-- the filter and the sort and Postgres can skip the sort node entirely.
create index concurrently if not exists orders_user_created_idx
  on public.orders (user_id, created_at desc);

-- The courier's assigned work. Partial: the vast majority of rows have a null
-- courier_id, and there is no query that wants those, so excluding them keeps
-- the index a fraction of the size and cheaper to maintain on every insert.
create index concurrently if not exists orders_courier_created_idx
  on public.orders (courier_id, created_at desc)
  where courier_id is not null;

-- The admin dispatch feed reads by status and recency.
create index concurrently if not exists orders_status_created_idx
  on public.orders (status, created_at desc);

-- The lifecycle equivalent, which is what the courier pool and the timeline
-- filter on now that lifecycle_state exists.
create index concurrently if not exists orders_lifecycle_created_idx
  on public.orders (lifecycle_state, created_at desc);

-- One row per garment, joined on every single order detail view. This is the
-- most important one on the list: order_items outgrows orders by whatever the
-- average basket size is.
create index concurrently if not exists order_items_order_idx
  on public.order_items (order_id);

-- Read on every payment status poll and every bank callback.
create index concurrently if not exists payments_order_idx
  on public.payments (order_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
-- Both of these must report "Index Scan" or "Bitmap Index Scan". "Seq Scan"
-- means the index was not created, or the planner does not think it is worth
-- using yet because the table is still tiny — re-check once there is real data.
--
--   explain analyze
--   select * from public.orders where user_id = '00000000-0000-0000-0000-000000000000'
--   order by created_at desc limit 20;
--
--   explain analyze
--   select * from public.order_items where order_id = '00000000-0000-0000-0000-000000000000';
--
-- And confirm none of them built invalid:
--
--   select indexrelid::regclass from pg_index where not indisvalid;
