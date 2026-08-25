-- Run this FIRST, in the Supabase SQL Editor, and keep the output.
--
-- rls.sql cannot be applied safely without knowing two things: which columns
-- `profiles` actually has, and which policies already exist. Neither is
-- knowable from this repository — the schema here was reconstructed from a
-- partial dump, and policies are not in source control at all.
--
-- Nothing here writes. Every statement is a SELECT against catalog views.

-- ---------------------------------------------------------------------------
-- 1. Does `profiles.avatar_url` exist?
-- ---------------------------------------------------------------------------
-- rls.sql line 30 grants UPDATE on it. If the column is absent the GRANT
-- errors, and because the SQL Editor wraps the script in a transaction, the
-- whole file rolls back — you would see an error and no policies applied.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;

-- ---------------------------------------------------------------------------
-- 2. What policies exist today?
-- ---------------------------------------------------------------------------
-- The critical one. DROP POLICY IF EXISTS only drops the *names* rls.sql
-- knows about; anything else survives, and permissive policies are OR'd
-- together. A single loose policy left in place makes the tighter ones
-- decorative.
select
  tablename,
  policyname,
  cmd,
  roles,
  qual        as using_expression,
  with_check  as check_expression
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- ---------------------------------------------------------------------------
-- 3. Which tables have RLS on at all?
-- ---------------------------------------------------------------------------
-- A table with rowsecurity = false is fully open to anyone holding the anon
-- key, regardless of what policies are written against it.
select
  c.relname                       as table_name,
  c.relrowsecurity                as rls_enabled,
  c.relforcerowsecurity           as rls_forced,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity, c.relname;

-- ---------------------------------------------------------------------------
-- 4. What can anon and authenticated actually do?
-- ---------------------------------------------------------------------------
-- Policies only narrow what a GRANT already allows. If `anon` holds UPDATE on
-- a table, that is a hole no policy closes — and column-level grants are the
-- only way to stop a customer writing their own `role` or `wallet_balance`.
select
  table_name,
  grantee,
  privilege_type,
  string_agg(coalesce(column_name, '(table-wide)'), ', ' order by column_name) as columns
from (
  select table_name, grantee, privilege_type, null::text as column_name
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated')
  union all
  select table_name, grantee, privilege_type, column_name
  from information_schema.column_privileges
  where table_schema = 'public' and grantee in ('anon', 'authenticated')
) g
group by table_name, grantee, privilege_type
order by table_name, grantee, privilege_type;

-- ---------------------------------------------------------------------------
-- 5. The specific escalation check
-- ---------------------------------------------------------------------------
-- Expect ZERO rows. Any row here means a signed-in customer can write that
-- column on their own profile — `role` would let them make themselves an
-- admin, `wallet_balance` would let them mint money.
select grantee, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'profiles'
  and grantee in ('anon', 'authenticated')
  and privilege_type = 'UPDATE'
  and column_name in ('role', 'wallet_balance', 'points', 'is_subscribed',
                      'subscription_expires_at', 'id');
