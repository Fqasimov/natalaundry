-- What is actually in this project, right now.
--
-- Companion to rls_audit.sql, which answers "who can do what". This one
-- answers "is any of it here" — the questions that decide whether a project
-- is the restored Frankfurt target, the original Seoul one, or an empty
-- shell someone clicked into existence.
--
-- Run it against either project. Run it against both, and diff the output:
-- that comparison is the migration's own acceptance test, and it is far more
-- convincing than a row count from the restore script.
--
-- Nothing here writes. Every statement is a SELECT.

-- ---------------------------------------------------------------------------
-- 0. Which project is this, and where does it live?
-- ---------------------------------------------------------------------------
-- The region is the whole point of the move, and it is the one fact that a
-- project ref alone does not carry. Seoul and Frankfurt hold identical
-- schemas by design, so schema shape cannot tell them apart — only this can.
select
  current_database()                as database,
  current_setting('server_version') as postgres_version,
  now()                             as checked_at;

-- ---------------------------------------------------------------------------
-- 1. Is the schema here at all?
-- ---------------------------------------------------------------------------
-- Expect 19 tables in a restored project, plus Laravel's own `migrations`.
-- A count near zero means the restore has not run; a count between means it
-- ran and failed partway, which is worse than either and worth stopping for.
select count(*) as public_tables
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r';

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- ---------------------------------------------------------------------------
-- 2. Extensions
-- ---------------------------------------------------------------------------
-- A restore replays objects that depend on these. If `pgcrypto` is missing,
-- every `gen_random_uuid()` default fails and the failure surfaces as a
-- confusing NOT NULL violation on insert, long after the restore "succeeded".
select extname, extversion, n.nspname as schema
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
order by extname;

-- ---------------------------------------------------------------------------
-- 3. is_my_assigned_courier — the function nobody has read
-- ---------------------------------------------------------------------------
-- Named in the live policies and never pulled into source control, so its
-- body has been taken on trust. It matters more than most: a SECURITY DEFINER
-- function runs as its owner and is callable by anyone holding the anon key.
-- If it trusts an argument instead of reading auth.uid() itself, then passing
-- someone else's order id is all it takes to be treated as that order's
-- courier.
--
-- Read the definition that comes back. It must derive the caller from
-- auth.uid() internally, not from anything passed in.
select
  p.proname                        as function_name,
  p.prosecdef                      as security_definer,
  pg_get_functiondef(p.oid)        as source
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'auth')
  and p.proname in ('is_my_assigned_courier', 'is_admin', 'is_courier')
order by p.proname;

-- Anything else custom, in case the policies lean on a helper this repo has
-- never heard of.
select p.proname, p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;

-- ---------------------------------------------------------------------------
-- 4. Did perf_indexes.sql land?
-- ---------------------------------------------------------------------------
-- Expect six. They are created CONCURRENTLY, which cannot run inside a
-- transaction — so a paste into the SQL Editor can fail halfway and leave
-- some present and some not, with an INVALID index left behind. `indisvalid`
-- false is the tell: the index exists, is not used, and still costs writes.
select
  i.relname            as index_name,
  t.relname            as table_name,
  x.indisvalid         as valid,
  pg_size_pretty(pg_relation_size(i.oid)) as size
from pg_index x
join pg_class i on i.oid = x.indexrelid
join pg_class t on t.oid = x.indrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and i.relname in (
    'orders_user_created_idx', 'orders_courier_created_idx',
    'orders_status_created_idx', 'orders_lifecycle_created_idx',
    'order_items_order_idx', 'payments_order_idx'
  )
order by i.relname;

-- ---------------------------------------------------------------------------
-- 5. The photo bucket
-- ---------------------------------------------------------------------------
-- `public` must be false. A public bucket makes every garment photo readable
-- by anyone who can guess an object name, and the names are guessable by
-- design. Zero rows means storage_order_photos.sql has not been applied and
-- uploads have nowhere to go.
select id, name, public, file_size_limit, allowed_mime_types, created_at
from storage.buckets
where id = 'order-photos';

select policyname, cmd, roles
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;

-- ---------------------------------------------------------------------------
-- 6. Seed data
-- ---------------------------------------------------------------------------
-- The gift box draws from `rewards`; an empty table makes every box open
-- fail at the moment a customer is watching an animation. ILK20 is the first
-- order discount the app announces but never sends — it has to exist server
-- side or the promise on the home screen is a lie.
select box_tier, active, count(*) as rewards
from rewards
group by box_tier, active
order by box_tier, active;

select code, kind, value, min_subtotal, max_redemptions, redemptions,
       active, starts_at, expires_at
from promo_codes
order by code;

-- ---------------------------------------------------------------------------
-- 7. Laravel's own table
-- ---------------------------------------------------------------------------
-- Laravel creates `migrations` in `public`, where PostgREST exposes it like
-- anything else. It is named in no policy file, so it is the table most
-- likely to have been left open. Expect rls_enabled true and no anon or
-- authenticated grants at all.
select
  c.relrowsecurity as rls_enabled,
  (select count(*) from information_schema.role_table_grants g
    where g.table_schema = 'public' and g.table_name = 'migrations'
      and g.grantee in ('anon', 'authenticated')) as exposed_grants
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'migrations';

select migration, batch from migrations order by batch, migration;
