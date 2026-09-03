-- Orphaned dispatch rows, and the missing keys that allowed them.
--
-- `courier_assignments` and `order_offers` both carry an `order_id` with no
-- foreign key behind it, so deleting an order leaves its offers behind. Three
-- such orphans were created on 2026-09-03 by probe orders that were cleaned up
-- afterwards: the orders went, the assignments stayed, and they now sit in a
-- courier's "unclaimed" set forever.
--
-- Harmless today only because fetchOfferedOrders joins back to `orders` and
-- filters on lifecycle_state, so a row pointing at nothing drops out. That is
-- the join doing the work a constraint should be doing.
--
-- Same treatment for courier_id: an offer to a courier who no longer exists is
-- not a record worth keeping.

begin;

-- Clear what is already orphaned, or the constraints below cannot be added.
delete from public.courier_assignments a
 where not exists (select 1 from public.orders o where o.id = a.order_id);

delete from public.order_offers f
 where not exists (select 1 from public.orders o where o.id = f.order_id);

delete from public.courier_assignments a
 where not exists (select 1 from public.profiles p where p.id = a.courier_id);

delete from public.order_offers f
 where not exists (select 1 from public.profiles p where p.id = f.courier_id);

alter table public.courier_assignments
  drop constraint if exists courier_assignments_order_id_fkey,
  add constraint courier_assignments_order_id_fkey
    foreign key (order_id) references public.orders (id) on delete cascade;

alter table public.courier_assignments
  drop constraint if exists courier_assignments_courier_id_fkey,
  add constraint courier_assignments_courier_id_fkey
    foreign key (courier_id) references public.profiles (id) on delete cascade;

alter table public.order_offers
  drop constraint if exists order_offers_order_id_fkey,
  add constraint order_offers_order_id_fkey
    foreign key (order_id) references public.orders (id) on delete cascade;

alter table public.order_offers
  drop constraint if exists order_offers_courier_id_fkey,
  add constraint order_offers_courier_id_fkey
    foreign key (courier_id) references public.profiles (id) on delete cascade;

commit;

notify pgrst, 'reload schema';
