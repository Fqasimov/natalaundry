-- URGENT #3: staff accounts could not be created, and admin could not exist.
--
-- Found 2026-08-27, while trying to create a courier and an admin from the
-- Supabase dashboard. Two separate defects, both live.
--
-- ---------------------------------------------------------------------------
-- (a) 'admin' is not an allowed role
-- ---------------------------------------------------------------------------
--   profiles_role_check: CHECK (role = ANY (ARRAY['user', 'courier']))
--
-- Meanwhile the API gates the entire dispatch console on role = 'admin':
--   AdminController::95, PaymentController::190, TrackingController::82,
--   OrderLifecycleService::34, Profile::isAdmin()
--
-- So the application demands a value the database rejects. No admin account
-- has ever been possible; `update profiles set role = 'admin'` fails with a
-- check violation. Widening the constraint is what makes the console usable.
--
-- This does NOT let a customer promote themselves. hotfix_profiles_grant.sql
-- already revoked UPDATE on profiles.role from `authenticated` at the column
-- level, and RLS cannot fence columns — the grant is the fence. Verified:
--   authenticated UPDATE -> birthday, language, last_active_at, name, phone,
--                           push_token          (role is absent)
--
-- ---------------------------------------------------------------------------
-- (b) any signup without name AND phone metadata aborts
-- ---------------------------------------------------------------------------
-- public.handle_new_user() reads both out of raw_user_meta_data:
--
--   phone -> COALESCE(new.phone, new.raw_user_meta_data->>'phone')
--   name  -> new.raw_user_meta_data->>'name'
--
-- but profiles.name and profiles.phone are NOT NULL, and phone is UNIQUE.
-- The dashboard's "Add user" form sends no metadata, so both come out NULL,
-- the insert violates NOT NULL, and the trigger takes the whole transaction
-- down. Supabase surfaces this only as "Database error creating new user",
-- which is why it looked like a permissions problem.
--
-- The app's own signup screen collects both fields, so customer signup was
-- unaffected and this stayed hidden. It would also have broken any OAuth
-- provider, magic-link, or phone-less signup.
--
-- Fixed by making the trigger tolerate their absence rather than by loosening
-- what the app sends:
--
--   * phone becomes nullable. It is still UNIQUE, and Postgres allows many
--     NULLs under a unique index, so staff accounts without a number do not
--     collide with each other. A placeholder would have had to be unique per
--     row and would then show up in the profile UI as real data.
--   * name falls back to the local part of the email, so it stays NOT NULL
--     and the admin list still shows something legible.
--
-- Safe for the app: app/(tabs)/profile.tsx already renders phone
-- conditionally (`profile.phone ? ... : null`), and lib/profile.ts types it
-- as nullable.
-- ---------------------------------------------------------------------------

begin;

-- (a) allow 'admin'
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['user'::text, 'courier'::text, 'admin'::text]));

-- (b) let a profile exist without a phone number
alter table public.profiles alter column phone drop not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Role is never read from raw_user_meta_data — it is client-supplied.
  -- Staff are promoted deliberately, after the fact.
  insert into public.profiles (id, email, phone, name, role, language)
  values (
    new.id,
    new.email,
    -- Nullable now: a dashboard-created staff account has no number, and
    -- NULL does not collide under the unique index the way a shared
    -- placeholder would.
    coalesce(new.phone, new.raw_user_meta_data->>'phone'),
    -- NOT NULL, so it needs a real fallback. The email's local part is the
    -- best thing available when no display name was supplied.
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'user'
    ),
    'user',
    coalesce(new.raw_user_meta_data->>'language', 'az')
  )
  on conflict (id) do nothing;

  insert into public.customer_details (id) values (new.id) on conflict do nothing;

  return new;
end;
$function$;

commit;

-- ---------------------------------------------------------------------------
-- Afterwards
-- ---------------------------------------------------------------------------
-- 1. Create the admin in Authentication -> Users (tick Auto Confirm).
-- 2. Promote it:
--      update public.profiles p set role = 'admin'
--      from auth.users u where u.id = p.id and u.email = '<the address>';
-- 3. Confirm no customer can promote themselves — re-run rls_audit.sql
--    query 5; it must still return zero rows for profiles.role.
