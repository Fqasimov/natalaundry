-- A courier could not see what they were collecting.
--
-- `order_items` has one SELECT policy and it reads:
--
--   EXISTS (select 1 from orders o
--            where o.id = order_items.order_id and o.user_id = auth.uid())
--
-- i.e. the customer, and nobody else. The assigned courier — who can see the
-- order itself, its address, its coordinates and its total — reads zero rows
-- from its item list. Verified against the live ₼45 order: 4 items, 0 visible
-- to the courier (scripts/migration/probe-courier-visibility.js).
--
-- That is not a security property, it is an oversight. The person driving to a
-- flat to collect laundry needs to know it is four shirts and not a rug, and
-- the courier app has a whole checklist it cannot populate.
--
-- Scoped as tightly as the order policy it mirrors: the courier assigned to
-- THIS order, and only while they hold it. `courier_id` is set by
-- transition_order/claim_order and cleared by nothing, so a delivered job stays
-- readable to the courier who did it — which is what their own history needs.

begin;

drop policy if exists "Couriers can view items of assigned orders" on public.order_items;

create policy "Couriers can view items of assigned orders"
on public.order_items
for select
using (
  exists (
    select 1
      from public.orders o
     where o.id = order_items.order_id
       and o.courier_id = auth.uid()
  )
);

commit;
