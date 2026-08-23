-- Row Level Security for the Nata Laundry schema.
--
-- NOT APPLIED. Supabase is unreachable from the build environment, so this is
-- written to be read and run by hand against the project. Review it against
-- the live policies before running: it is written to be additive and idempotent
-- where it can be, but the DROP POLICY lines do replace whatever is there now.
--
-- Why this file exists: the app talks to Postgres directly for reads, so RLS is
-- the only thing between a signed-in customer and every other customer's rows.
-- The writes that decide money or state now go through the Laravel API instead
-- (see lib/api.ts), which connects as the database owner and bypasses RLS —
-- these policies therefore only need to describe what the *app* may do, and
-- they should describe it as narrowly as possible.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- The important one. `role` decides who is a courier and who is an admin, and
-- `wallet_balance` / `points` are money. A blanket "users can update their own
-- profile" policy lets a customer make themselves an admin with one PATCH,
-- because RLS chooses rows, not columns.
--
-- Postgres has no column-level RLS, so the column list is fenced off with a
-- table grant: the `authenticated` role is granted UPDATE on exactly the
-- columns the app edits, and the policy then limits it to its own row.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (name, phone, avatar_url, language, birthday, last_active_at)
  ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- No INSERT and no DELETE policy: rows are created by the auth trigger on
-- signup, and an account is deleted through Supabase Auth, not by the app.

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
-- Reads: your own orders, or one you are the assigned courier for. Couriers
-- also need to see the pool of orders offered to them, which is expressed
-- through courier_assignments rather than by opening every pending order.
--
-- Writes: none. Every order write the app makes now goes through the API.

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.orders FROM authenticated;

DROP POLICY IF EXISTS "Users read own orders" ON public.orders;
CREATE POLICY "Users read own orders" ON public.orders
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR courier_id = auth.uid()
    OR (
      courier_id IS NULL
      AND lifecycle_state = 'assigning_couriers'
      AND EXISTS (
        SELECT 1 FROM public.courier_assignments ca
        WHERE ca.order_id = orders.id AND ca.courier_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- order_items
-- ---------------------------------------------------------------------------
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM authenticated;

DROP POLICY IF EXISTS "Read items of visible orders" ON public.order_items;
CREATE POLICY "Read items of visible orders" ON public.order_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (o.user_id = auth.uid() OR o.courier_id = auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- courier_assignments
-- ---------------------------------------------------------------------------
-- A courier sees only their own offers. Seeing another courier's offers would
-- leak the dispatch pool and every address in it.
ALTER TABLE public.courier_assignments ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.courier_assignments FROM authenticated;

DROP POLICY IF EXISTS "Couriers read own offers" ON public.courier_assignments;
CREATE POLICY "Couriers read own offers" ON public.courier_assignments
  FOR SELECT TO authenticated
  USING (courier_id = auth.uid());

-- ---------------------------------------------------------------------------
-- courier_locations
-- ---------------------------------------------------------------------------
-- A courier's live position is personal data. It is readable only by the
-- customer whose order it belongs to, and only while that order is actually en
-- route — the trail should not stay open after delivery.
ALTER TABLE public.courier_locations ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.courier_locations FROM authenticated;

DROP POLICY IF EXISTS "Read positions for my in-flight order" ON public.courier_locations;
CREATE POLICY "Read positions for my in-flight order" ON public.courier_locations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = courier_locations.order_id
      AND (o.user_id = auth.uid() OR o.courier_id = auth.uid())
      AND o.lifecycle_state IN ('courier_en_route_pickup', 'courier_en_route_delivery')
  ));

-- ---------------------------------------------------------------------------
-- order_status_logs
-- ---------------------------------------------------------------------------
ALTER TABLE public.order_status_logs ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.order_status_logs FROM authenticated;

DROP POLICY IF EXISTS "Read timeline of visible orders" ON public.order_status_logs;
CREATE POLICY "Read timeline of visible orders" ON public.order_status_logs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_status_logs.order_id
      AND (o.user_id = auth.uid() OR o.courier_id = auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
-- The one place the app still updates a row directly, because marking your own
-- notification read decides nothing. The grant keeps it to the `read` column so
-- the body and its order reference cannot be rewritten.
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM authenticated;
GRANT UPDATE (read) ON public.notifications TO authenticated;

DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users mark own notifications read" ON public.notifications;
CREATE POLICY "Users mark own notifications read" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- service_prices
-- ---------------------------------------------------------------------------
-- Public read of active rows is intended (the catalogue). Writes are not.
ALTER TABLE public.service_prices ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.service_prices FROM authenticated, anon;
