-- Express doubles the ORDER TOTAL. Eco and the outside-city fee are gone.
--
-- Set 2026-09-04 by the owner: a ₼40 basket with free delivery totals ₼40 as
-- standard and ₼80 as express. Express is not a delivery surcharge — the
-- delivery leg is the same drive either way. It is the price of jumping the
-- queue, so it is charged as a multiple of the whole job.
--
-- IT IS `recalc_order_total` THAT IS LIVE, not `enforce_order_pricing`.
-- `enforce-order-pricing.sql` in this repo defines the latter, and the live
-- trigger trg_recalc_order_total on public.order_items has never called it —
-- the two have identical bodies under different names, so replacing the wrong
-- one applies cleanly, reports success and changes nothing. That cost a round
-- of debugging on 2026-09-04: standard priced correctly (both versions agree
-- there) while express kept coming back at the old +₼5.
--
-- Check the trigger, not the filename:
--   select tgname, p.proname from pg_trigger g join pg_proc p on p.oid = g.tgfoid
--    where tgrelid = 'public.order_items'::regclass and not tgisinternal;
--
-- `enforce_order_pricing` is left in place, dead, rather than dropped here:
-- deleting a function nothing calls is not worth doing blind in the same
-- change that fixes pricing.
--
-- Three notes:
--
--  * `delivery_fee` stays the honest cost of the delivery itself, ₼0 or ₼5.
--    The doubling lands in `total`, so a row satisfies
--        total = 2 x (subtotal - discount + delivery_fee)   when express
--    rather than the plain sum. `delivery_tier` is on the row and is what
--    explains the difference — do not "fix" a doubled total back down.
--  * The multiplier applies AFTER the discount, so ILK20 and express compose
--    the way a customer expects: discount first, then double what is left.
--  * `is_outside_city` no longer enters the arithmetic — the slider that set
--    it is gone. The column stays for the orders that already carry it, but a
--    reprice of such an order will now come out lower than it was placed at.
--    That only happens if its order_items change, which is a courier
--    correction, and the new figure is the correct one under today's rules.
--
-- Must stay in step with lib/pricing.ts and backend/config/nata.php. The
-- database is the last of the three to see an order and silently wins any
-- disagreement, which is why the rule is repeated here at all.

begin;

create or replace function public.recalc_order_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  oid       uuid := coalesce(new.order_id, old.order_id);
  o         public.orders;
  computed  numeric;
  fee       numeric;
  disc      numeric := 0;
  payable   numeric;
  mult      numeric;
begin
  select * into o from public.orders where id = oid;

  if o.service_type = 'bulk' then
    return null;
  end if;

  select coalesce(sum(price * quantity), 0) into computed
  from public.order_items where order_id = oid;

  -- Delivery: free over the threshold, otherwise the base fee. The tier does
  -- not change this.
  fee := case when computed >= 40 then 0 else 5 end;

  -- ILK20: 20% off, first order only. Counted over the customer's OTHER
  -- orders, so the one being priced does not disqualify itself.
  if upper(coalesce(o.promo_code, '')) = 'ILK20'
     and not exists (
       select 1 from public.orders x
       where x.user_id = o.user_id
         and x.id <> oid
         and x.status <> 'cancelled'
     )
  then
    disc := round(computed * 0.20, 2);
  end if;

  -- What the customer would pay as standard, then doubled for express.
  payable := greatest(computed - disc, 0) + fee;
  mult    := case o.delivery_tier when 'express' then 2 else 1 end;

  update public.orders
     set subtotal     = computed,
         delivery_fee = fee,
         discount     = disc,
         total        = payable * mult
   where id = oid;

  return null;
end;
$$;

commit;
