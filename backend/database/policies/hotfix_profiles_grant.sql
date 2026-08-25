-- URGENT: close the profiles privilege-escalation hole.
--
-- Confirmed live on 2026-08-25 by rls_audit.sql query 5, which returned six
-- rows where it must return zero:
--
--   authenticated | id                      | UPDATE
--   authenticated | is_subscribed           | UPDATE
--   authenticated | points                  | UPDATE
--   authenticated | role                    | UPDATE   <-- admin escalation
--   authenticated | subscription_expires_at | UPDATE
--   authenticated | wallet_balance          | UPDATE   <-- mints money
--
-- Any signed-in user can therefore rewrite their own role to 'admin' or set
-- their own wallet balance. RLS does not help: it selects *rows*, and this is
-- the user's own row. Postgres has no column-level RLS, so a table grant is
-- the only mechanism that fences off columns.
--
-- This file deliberately does NOT enable RLS anywhere, create policies, or
-- touch any other table. It is the smallest change that closes the hole, so it
-- can go out ahead of the wider rls_v2.sql rollout without risking a blank
-- catalogue or hidden rows. Run rls_v2.sql afterwards, once its audit output
-- has been reconciled.
--
-- Safe for the app: the only profile columns it writes directly are `name` and
-- `phone` (lib/auth-context.tsx and app/profile/personal.tsx), both retained
-- below. Everything else on profiles is written by the Laravel API, which
-- connects as the table owner and is unaffected by grants to `authenticated`.

begin;

-- Take back everything, then hand back only what the app legitimately edits.
revoke update on public.profiles from authenticated;
revoke update on public.profiles from anon;

-- Columns the customer genuinely owns. Verified present in the schema mirror
-- (backend/tests/Support/SupabaseSchema.php). `avatar_url` is deliberately
-- absent — it appears nowhere in the app's types, and naming a column that
-- does not exist would abort this transaction.
--
-- If your live profiles table lacks any of these, remove it from the list and
-- re-run; check with rls_audit.sql query 1 first if unsure.
grant update (name, phone, language, birthday, last_active_at, push_token)
  on public.profiles to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Verify: re-run rls_audit.sql query 5. It must now return zero rows.
-- ---------------------------------------------------------------------------
-- select grantee, column_name, privilege_type
-- from information_schema.column_privileges
-- where table_schema='public' and table_name='profiles'
--   and grantee in ('anon','authenticated')
--   and privilege_type='UPDATE'
--   and column_name in ('role','wallet_balance','points','is_subscribed',
--                       'subscription_expires_at','id');

-- ---------------------------------------------------------------------------
-- Rollback, if the app breaks unexpectedly:
-- ---------------------------------------------------------------------------
--   grant update on public.profiles to authenticated;
-- That restores the previous (insecure) state. Prefer adding the specific
-- missing column to the grant list above instead.
