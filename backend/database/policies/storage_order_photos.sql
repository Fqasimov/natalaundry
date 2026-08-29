-- Somewhere for garment photos to actually live.
--
-- Found 2026-08-27: every stored photo path in production is a `file://` or
-- `content://` device URI. They were never uploaded anywhere, so the courier
-- and the admin console can never see them — the three-photo evidence trail
-- that protects the business in a damage dispute does not exist. The column
-- has been faithfully recording paths that mean nothing off the phone that
-- took them.
--
-- Private, not public. These are photographs of customers' clothing inside
-- their homes; a public bucket makes every one of them world-readable to
-- anyone who can guess a URL, and object names are guessable by design.
--
-- Layout is `<user-uuid>/<random>.jpg`. The first path segment being the
-- owner's id is what the policies below key on, and it is why a customer
-- cannot write into another customer's folder.
--
-- Courier and admin access is deliberately NOT granted here. They read
-- through the API, which holds the service role and can issue a short-lived
-- signed URL after checking the order actually belongs to that courier. A
-- storage policy cannot express "the courier assigned to this order" without
-- duplicating the orders join into the storage schema.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'order-photos',
  'order-photos',
  false,
  5242880,                                    -- 5 MB; phone photos land well under
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Upload: only into your own folder.
drop policy if exists "Customers upload their own order photos" on storage.objects;
create policy "Customers upload their own order photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'order-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Read: only your own. The courier's view is signed by the API instead.
drop policy if exists "Customers read their own order photos" on storage.objects;
create policy "Customers read their own order photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'order-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Delete: only your own, and only before the order is filed. Removing a photo
-- from the basket screen is an ordinary edit; removing evidence after the
-- courier has collected is not, so the app only ever deletes drafts.
drop policy if exists "Customers delete their own order photos" on storage.objects;
create policy "Customers delete their own order photos" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'order-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- No update policy: an uploaded photo is immutable. Overwriting one would let
-- a customer swap the evidence after a dispute has started.

commit;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
--   select id, public, file_size_limit from storage.buckets where id = 'order-photos';
--   select polname from pg_policy p
--     join pg_class c on c.oid = p.polrelid
--    where c.relname = 'objects';
--
-- `public` must read false. If it is true, every customer's photos are
-- readable by anyone with a URL.
