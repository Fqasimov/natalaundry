-- Client-controlled columns on `orders`, and the latent write grants behind
-- several other tables.
--
-- Found 2026-09-03 by scripts/migration/probe-order-tampering.js: a signed-in
-- customer could insert an order with
--
--   lifecycle_state = 'delivered'   dispatch_state = 'assigned'
--   courier_id      = <anyone>      approved_at / assigned_at / delivered_at set
--
-- and every one of those survived. `status` and `payment_status` were forced
-- back to 'pending' and the pricing was stripped, so no money moved — but the
-- order skipped the dispatch queue, named its own courier and read as already
-- delivered. The courier and admin views key off lifecycle_state.
--
-- The cause is ordinary drift: `force_order_pending` sets `status` and nothing
-- else, because it was written before lifecycle_state and dispatch_state were
-- added by a later migration. The guard was never extended with the schema.
--
-- Two layers, deliberately. The trigger holds even if grants are changed by a
-- future migration; the grants hold even if a trigger is dropped or replaced.

begin;

-- ── Layer 1: the trigger decides the opening state ──────────────────────────

create or replace function public.force_order_pending()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- No auth.uid() means a server-side caller: the service role, Laravel, or an
  -- Edge Function. Those are trusted and must stay able to seed any state.
  -- Admins likewise. This mirrors guard_payment_status, deliberately.
  if auth.uid() is null then
    return new;
  end if;

  if (select role from public.profiles where id = auth.uid()) = 'admin' then
    return new;
  end if;

  -- Everything a customer must not choose about a brand-new order.
  new.status                 := 'pending';
  new.lifecycle_state        := 'order_placed';
  new.dispatch_state         := 'awaiting_admin';
  new.courier_id             := null;

  new.approved_at            := null;
  new.offered_at             := null;
  new.assigned_at            := null;
  new.collected_at           := null;
  new.cleaning_started_at    := null;
  new.processing_finished_at := null;
  new.delivering_at          := null;
  new.delivered_at           := null;

  new.counted_at             := null;
  new.counted_by             := null;
  new.counted_total          := null;

  return new;
end;
$$;

-- ── Layer 2: the client may only name the columns it legitimately sends ─────
--
-- These are exactly the fields lib/orders.ts writes in createOrder and
-- createTopluOrder. subtotal/total stay grantable because they are NOT NULL
-- with no default and the app sends 0; the triggers and recalc_order_total
-- overwrite them anyway.

revoke insert on public.orders from authenticated;
grant insert (
  user_id, service_type, subtotal, total, delivery_tier,
  collection_time, delivery_time, address, address_lat, address_lng,
  notes, is_outside_city, item_photos, promo_code, reward_id, payment_method
) on public.orders to authenticated;

-- ── Latent grants on tables with no write policy ────────────────────────────
--
-- RLS refuses these today only because no policy permits them — proven by
-- scripts/migration/probe-client-writes.js. The grants are a loaded gun: one
-- permissive policy, or one table with RLS accidentally off, and a client can
-- rewrite prices or credit its own wallet. Nothing in the app writes them;
-- they all go through SECURITY DEFINER functions owned by postgres.

revoke insert, update, delete on public.service_prices      from authenticated, anon;
revoke insert, update, delete on public.payments            from authenticated, anon;
revoke insert, update, delete on public.payment_intents     from authenticated, anon;
revoke insert, update, delete on public.wallet_transactions from authenticated, anon;
revoke insert, update, delete on public.order_offers        from authenticated, anon;
revoke insert, update, delete on public.customer_details    from authenticated, anon;

-- Couriers create and update their own detail row (there are policies for
-- both), but nothing deletes one.
revoke delete on public.courier_details from authenticated, anon;

-- The app marks a notification read. It has no business rewriting the title
-- and body of a message the system sent it, nor inserting its own.
revoke insert, update, delete on public.notifications from authenticated, anon;
grant update (read) on public.notifications to authenticated;

commit;
