-- Let couriers hear about work the moment it is offered.
--
-- `supabase_realtime` was empty: no table published changes, so nothing in the
-- app could ever be pushed a row. Every screen discovered new work only when
-- something refetched — a pull-to-refresh, or a tab mount — which is why a
-- broadcast job sat unseen until the courier thought to look.
--
-- Two tables, and only two:
--
--   courier_assignments  an INSERT here IS the offer. This is the event the
--                        courier's home screen waits on.
--   orders               so an offer that someone else claims, or that the
--                        admin cancels, leaves the list without a refresh.
--
-- Nothing else is added. Every published table costs a stream of change
-- events to every subscribed client, and `courier_locations` in particular
-- would be a firehose — a ping every few seconds per active courier, read by
-- nobody in real time.
--
-- RLS still applies to realtime: a client is only sent a change to a row it
-- could have SELECTed. The courier policies already restrict
-- courier_assignments to the courier's own rows, so an offer to one courier is
-- not delivered to another. That is worth stating because it is the whole
-- security model here — publishing a table does not widen who can read it.
--
-- Replica identity is left at default. It carries the primary key on UPDATE
-- and the full new row on INSERT, which is all the client needs; it refetches
-- on any event rather than trusting the payload.

begin;

alter publication supabase_realtime add table public.courier_assignments;
alter publication supabase_realtime add table public.orders;

commit;
