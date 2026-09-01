-- URGENT: close the discount hole opened by restoring the INSERT policies.
--
-- recalc_order_total computes
--   total = GREATEST(subtotal - discount, 0) + delivery_fee
-- and takes `discount` and `delivery_fee` exactly as the client sent them.
--
-- So direct writes reintroduced a subtler version of the bug
-- hotfix_2_order_writes.sql closed on 2026-08-25. Naming the total no longer
-- works — enforce_item_price and recalc_order_total overwrite it — but naming a
-- discount does. Verified against the live database: a customer inserting an
-- order with discount = 9999 alongside a 100.00 item had it stored as
--
--   subtotal 100.00 | discount 9999.00 | delivery_fee 0.00 | TOTAL 0.00
--
-- The fix puts both figures under the database's control, exactly as
-- enforce_item_price already does for line prices. The numbers come from
-- lib/pricing.ts and config/nata.php, which are pinned by CatalogParityTest and
-- derived from the video's own arithmetic (₼37 + ₼5 = ₼42).
--
--   php scripts/migration/apply-order-pricing.php --apply

begin;

-- 1. A client may not name either figure on the way in.
create or replace function public.strip_client_pricing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Bulk orders are priced entirely by enforce_bulk_deposit; leave them be.
  if new.service_type = 'bulk' then
    return new;
  end if;

  new.discount     := 0;
  new.delivery_fee := 0;
  return new;
end;
$$;

drop trigger if exists trg_strip_client_pricing on public.orders;
create trigger trg_strip_client_pricing
  before insert on public.orders
  for each row execute function public.strip_client_pricing();

-- 2. Price the order from the catalogue once its items are known.
--
-- This runs on the order_items triggers, so it fires after the lines exist —
-- which is why the delivery fee cannot be decided at insert time on `orders`,
-- when the subtotal is still zero.
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
  surcharge numeric;
begin
  select * into o from public.orders where id = oid;

  if o.service_type = 'bulk' then
    return null;
  end if;

  select coalesce(sum(price * quantity), 0) into computed
  from public.order_items where order_id = oid;

  -- Delivery: free over the threshold, otherwise the base fee. The tier
  -- surcharge and the out-of-city fee are additive and apply either way.
  surcharge := case o.delivery_tier when 'express' then 5 else 0 end;

  fee := case when computed >= 40 then 0 else 5 end
       + surcharge
       + case when coalesce(o.is_outside_city, false) then 5 else 0 end;

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

  update public.orders
     set subtotal     = computed,
         delivery_fee = fee,
         discount     = disc,
         total        = greatest(computed - disc, 0) + fee
   where id = oid;

  return null;
end;
$$;

commit;
