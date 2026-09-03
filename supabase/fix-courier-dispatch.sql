-- The courier side could not complete a single job. Three separate faults,
-- found 2026-09-03 by scripts/migration/probe-courier-journey.js.
--
--
-- 1. TRACKING NEVER WORKED
--
-- `courier_locations.id` is `uuid NOT NULL` with **no default**. Laravel's
-- models generate their own uuids in PHP, so the table was created without
-- one — but lib/tracking.ts writes this table straight from the app and does
-- not send an id. Every location ping therefore failed with
--
--   null value in column "id" of relation "courier_locations" violates
--   not-null constraint
--
-- and the table holds 0 rows. Live tracking has never worked at all.
-- `courier_assignments` has the same shape; Laravel fills its id today, but
-- anything else writing that table would hit the same wall.
--
--
-- 2. A DISPATCHED JOB COULD NOT BE CLAIMED
--
-- There are two dispatch implementations writing two different tables:
--
--   Laravel  OrderLifecycleService::broadcast -> courier_assignments
--   Postgres transition_order (the claim)     -> checks order_offers
--
-- The app reads `courier_assignments` for its offer list and then claims via
-- `transition_order`, which looks in `order_offers` and finds nothing — so the
-- courier sees the job, taps Claim, and is told someone else took it. Both
-- tables are empty in production, so this has never worked either.
--
-- Rather than pick a winner and break whichever dispatcher is live, an insert
-- into `courier_assignments` now mirrors into `order_offers`. One dispatch,
-- both readers satisfied. The mirror is one-directional on purpose: making it
-- symmetric would need loop guards for no benefit, since Laravel is the only
-- thing that broadcasts.
--
--
-- 3. THE LEGACY CLAIM STRANDED THE ORDER
--
-- `claim_order` sets status/dispatch_state/courier_id and never touches
-- `lifecycle_state`, because it predates that column. The courier UI drives
-- entirely off lifecycle_state, so an order claimed this way sat at
-- 'order_placed' and every subsequent step was refused with
-- "Cannot go from order_placed to courier_en_route_pickup". All 16 orders in
-- production are at 'order_placed', including the 8 marked dispatch_state
-- 'assigned' — that is this bug's fingerprint.
--
-- CLAUDE.md already says `status` must never be written directly and is
-- derived from lifecycle_state. This function was the exception nobody had
-- revisited.

begin;

-- ── 1. ids the database can generate itself ────────────────────────────────

alter table public.courier_locations   alter column id set default gen_random_uuid();
alter table public.courier_assignments alter column id set default gen_random_uuid();

-- ── 2. one dispatch, both offer tables ─────────────────────────────────────

create or replace function public.mirror_assignment_to_offer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (
    select 1 from public.order_offers
     where order_id = new.order_id and courier_id = new.courier_id
  ) then
    insert into public.order_offers (order_id, courier_id, offered_at)
    values (new.order_id, new.courier_id, coalesce(new.offered_at, now()));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mirror_assignment_to_offer on public.courier_assignments;
create trigger trg_mirror_assignment_to_offer
after insert on public.courier_assignments
for each row execute function public.mirror_assignment_to_offer();

-- ── 3. the legacy claim moves the lifecycle too ────────────────────────────

create or replace function public.claim_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  claimed boolean := false;
begin
  if (select role from public.profiles where id = auth.uid()) <> 'courier' then
    raise exception 'Permission denied: couriers only.';
  end if;

  if not exists (
    select 1 from public.order_offers
     where order_id = p_order_id and courier_id = auth.uid()
  ) then
    raise exception 'This order was not offered to you.';
  end if;

  update public.orders
     set courier_id      = auth.uid(),
         dispatch_state  = 'assigned',
         assigned_at     = now(),
         -- Both of these, together. Setting `status` alone is what stranded
         -- every claimed order at 'order_placed'.
         lifecycle_state = 'courier_assigned',
         status          = 'collecting'
   where id = p_order_id
     and dispatch_state = 'offered'
     and courier_id is null;

  get diagnostics claimed = row_count;

  if claimed then
    update public.order_offers
       set response = 'accepted', responded_at = now()
     where order_id = p_order_id and courier_id = auth.uid();

    update public.order_offers
       set response = 'expired', responded_at = now()
     where order_id = p_order_id and courier_id <> auth.uid() and response is null;
  end if;

  return claimed;
end;
$$;

commit;
