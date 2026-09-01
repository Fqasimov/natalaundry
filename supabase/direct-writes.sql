-- Writing orders without a server.
--
-- The 1.0.2 build wrote straight to Supabase and needed no API. That path was
-- closed on 2026-08-25 by hotfix_2_order_writes.sql, because the INSERT
-- policies of the day checked only *whose* order it was and nothing about the
-- values in it: anyone with the anon key could insert total = 0.01.
--
-- The database has since grown BEFORE INSERT triggers that overwrite price from
-- the catalogue, recompute the total and force the status. Proved against this
-- database by scripts/migration/can-client-write-safely.php: a client asking
-- for total 0.01 / status 'completed' / line price 0 got back 100.00 / 'pending'
-- / 100.00. The hole is closed in the database now, where PostgREST cannot get
-- around it, so the policies can come back.
--
-- What the client still may NOT do directly, and why each is a function here:
--
--   claim_order        two couriers can claim the same order in the same
--                      millisecond; the winner has to be decided by the
--                      database, not by a read followed by a write
--   transition_order   the nine-state machine, who may drive each step, and
--                      keeping the legacy six-value `status` column truthful
--
-- Both are SECURITY DEFINER so they can update columns the caller has no grant
-- on, and both re-check the caller's identity internally — being callable is
-- not being authorised.
--
-- Ported from App\Support\OrderLifecycle and App\Services\OrderLifecycleService
-- so the rules stay identical to the ones the tests already pin.

begin;

-- ---------------------------------------------------------------------------
-- 1. Customers may create their own orders again.
-- ---------------------------------------------------------------------------

drop policy if exists "Users can insert their own orders" on public.orders;
create policy "Users can insert their own orders"
  on public.orders for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can insert their own order items" on public.order_items;
create policy "Users can insert their own order items"
  on public.order_items for insert to authenticated
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id and o.user_id = auth.uid()
    )
  );

grant insert on public.orders to authenticated;
grant insert on public.order_items to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Couriers may record their own position, on an order that is theirs.
--
-- Deliberately not "any authenticated user": a location row is evidence about
-- where someone was.
-- ---------------------------------------------------------------------------

drop policy if exists "Couriers can insert their own locations" on public.courier_locations;
create policy "Couriers can insert their own locations"
  on public.courier_locations for insert to authenticated
  with check (
    courier_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id and o.courier_id = auth.uid()
    )
  );

grant insert on public.courier_locations to authenticated;

-- ---------------------------------------------------------------------------
-- 3. claim_order is NOT redefined here.
--
-- It already exists, from the 1.0.2 architecture, and it is better than a
-- naive claim: it requires an entry in order_offers, so a courier can only take
-- an order that was actually offered to them, and it expires the other offers
-- in the same transaction. Its race is decided by a conditional UPDATE plus
-- GET DIAGNOSTICS, which is correct.
--
-- Redefining it would also have failed loudly — it returns boolean, and
-- `create or replace` cannot change a return type — which is how this was
-- caught before anything was applied.
--
-- Same for record_bulk_count, spend_wallet, decline_order and
-- settle_payment_intent: all still present, all still correct. The only thing
-- genuinely missing is the lifecycle axis the rebuild introduced, below.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 4. transition_order — the nine-state machine.
--
-- TRANSITIONS, ACTORS and LEGACY_STATUS are lifted verbatim from
-- App\Support\OrderLifecycle. `status` is derived here and never written
-- directly by a caller: it has only six values and the live RLS policies
-- depend on them.
-- ---------------------------------------------------------------------------

create or replace function public.transition_order(p_order uuid, p_to text)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.orders;
  v_role    text;
  v_actor   text;
  v_allowed text[];
  v_actors  text[];
  v_status  text;
begin
  -- Lock the row for the duration: two couriers advancing the same order at
  -- once must be serialised, not interleaved.
  select * into v_row from public.orders where id = p_order for update;
  if v_row.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  select role into v_role from public.profiles where id = auth.uid();

  -- Which hat is this caller wearing on THIS order?
  --
  -- The last branch is the claim: a courier taking an order that has not been
  -- assigned yet is not its courier *until* the transition succeeds, so
  -- identity alone would lock them out of the step that creates the identity.
  -- It is narrow on purpose — only into `courier_assigned`, only while
  -- courier_id is still null, and only for someone the order was offered to.
  v_actor := case
    when v_role = 'admin'              then 'admin'
    when v_row.courier_id = auth.uid() then 'courier'
    when v_row.user_id    = auth.uid() then 'customer'
    when v_role = 'courier'
         and p_to = 'courier_assigned'
         and v_row.courier_id is null
         and exists (
           select 1 from public.order_offers
           where order_id = p_order and courier_id = auth.uid()
         )                             then 'courier'
    else null
  end;

  if v_actor is null then
    raise exception 'Not your order' using errcode = '42501';
  end if;

  v_allowed := case coalesce(v_row.lifecycle_state, 'order_placed')
    when 'order_placed'             then array['assigning_couriers','cancelled']
    when 'assigning_couriers'       then array['courier_assigned','cancelled']
    when 'courier_assigned'         then array['courier_en_route_pickup','cancelled']
    when 'courier_en_route_pickup'  then array['picked_up','cancelled']
    when 'picked_up'                then array['at_laundry']
    when 'at_laundry'               then array['processing_finished']
    when 'processing_finished'      then array['courier_en_route_delivery']
    when 'courier_en_route_delivery' then array['delivered']
    else array[]::text[]
  end;

  if not (p_to = any (v_allowed)) then
    raise exception 'Cannot go from % to %', v_row.lifecycle_state, p_to
      using errcode = 'P0001';
  end if;

  v_actors := case p_to
    when 'assigning_couriers'        then array['admin']
    when 'courier_assigned'          then array['courier']
    when 'courier_en_route_pickup'   then array['courier']
    when 'picked_up'                 then array['courier']
    when 'at_laundry'                then array['admin','courier']
    when 'processing_finished'       then array['admin']
    when 'courier_en_route_delivery' then array['courier']
    when 'delivered'                 then array['courier']
    when 'cancelled'                 then array['customer','admin']
    else array[]::text[]
  end;

  if not (v_actor = any (v_actors)) then
    raise exception 'A % may not move an order to %', v_actor, p_to
      using errcode = '42501';
  end if;

  v_status := case p_to
    when 'order_placed'              then 'pending'
    when 'assigning_couriers'        then 'pending'
    when 'courier_assigned'          then 'pending'
    when 'courier_en_route_pickup'   then 'collecting'
    when 'picked_up'                 then 'collecting'
    when 'at_laundry'                then 'cleaning'
    when 'processing_finished'       then 'cleaning'
    when 'courier_en_route_delivery' then 'delivering'
    when 'delivered'                 then 'completed'
    when 'cancelled'                 then 'cancelled'
  end;

  update public.orders
     set lifecycle_state = p_to,
         status          = v_status,
         -- The claim itself: only ever fills a null, so it cannot steal an
         -- order from the courier already on it.
         courier_id  = case when p_to = 'courier_assigned' and courier_id is null
                            then auth.uid() else courier_id end,
         -- stamp_order_stage covers the columns keyed to `status`; these two
         -- have no status of their own to hang off.
         offered_at  = case when p_to = 'assigning_couriers'
                            then coalesce(offered_at, now())  else offered_at  end,
         assigned_at = case when p_to = 'courier_assigned'
                            then coalesce(assigned_at, now()) else assigned_at end,
         processing_finished_at = case when p_to = 'processing_finished'
                            then coalesce(processing_finished_at, now())
                            else processing_finished_at end
   where id = p_order
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants.
--
-- EXECUTE only for `authenticated`. Never `anon`: both of these act as the
-- table owner, and an unauthenticated caller has no auth.uid() to check
-- against, so the identity checks above would compare against null.
-- ---------------------------------------------------------------------------

revoke all on function public.claim_order(uuid) from public, anon;
revoke all on function public.transition_order(uuid, text) from public, anon;

grant execute on function public.claim_order(uuid) to authenticated;
grant execute on function public.transition_order(uuid, text) to authenticated;

commit;
