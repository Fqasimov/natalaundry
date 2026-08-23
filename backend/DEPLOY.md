# Deploying the Nata Laundry API

The app will not create an order without this deployed: `EXPO_PUBLIC_API_URL`
is required with no fallback, deliberately, because the fallback would be a
client-priced order (see `SECURITY.md`).

## What this needs

A host that runs a Dockerfile and can reach the Supabase Postgres. Railway,
Render, Fly and Cloud Run all qualify; so does any VPS with Docker.

There is nothing to persist. Sessions are cookies, the queue is `sync`, the
cache is files, and the only database is Supabase — so the container can be
replaced at any time and scaled to more than one instance without changing
anything.

## Environment

Copy `backend/.env.example`, then set:

| Variable | Where it comes from |
| --- | --- |
| `APP_KEY` | `php artisan key:generate --show` |
| `APP_URL` | The deployed URL. The admin console builds its API base from this, and the CSP names it — get it wrong and the console loads but cannot call the API. |
| `APP_ENV` / `APP_DEBUG` | `production` / `false` |
| `DB_*` | Supabase → Project Settings → Database. Use the **pooler** host on a platform that opens many short-lived connections. |
| `SUPABASE_URL` | Project Settings → API. The token middleware pins the issuer to `{SUPABASE_URL}/auth/v1`. |
| `SUPABASE_JWT_SECRET` | Project Settings → API → JWT Settings. **Every request is verified with this** — without it the API rejects everyone. |
| `SUPABASE_ANON_KEY` | Publishable; the admin console signs staff in with it. |
| `GOOGLE_MAPS_API_KEY` | Geocoding only. |

## Migrations — read before running

**Do not run `php artisan migrate` blind.** Laravel's base migrations create
`users`, `cache`, `jobs` and `sessions`, and this project needs none of them:
the drivers are file/cookie/sync and identity lives in Supabase's own `auth`
schema. Running them against the production database is the one step that can
damage data that is not ours.

Run only the additive ones, and look first:

```bash
php artisan migrate --pretend            # read the SQL it would run
php artisan migrate --path=database/migrations/2026_08_21_000001_add_order_lifecycle_tables.php
php artisan migrate --path=database/migrations/2026_08_20_094021_create_gift_box_tables.php
```

Both are guarded with `hasTable` / `hasColumn`, so they are safe to re-run.

Still unresolved before touching production: `orders.reward_id` exists in the
live schema but no rewards table appeared in the dump, so reconcile the gift
box tables against what is actually there first.

## Then seed the prize pool

```bash
php artisan db:seed --class=RewardSeeder
```

Idempotent — it upserts the fifty prizes by (kind, title, tier) and
deactivates anything left under the retired tiers.

## Row Level Security

`database/policies/rls.sql` is **not applied**. Run it from the Supabase SQL
editor and read it first — it revokes column-level UPDATE grants on
`profiles`, which is what stops a customer making themselves an admin. See
`SECURITY.md`.

## Point the app at it

In the repo root `.env` (and in EAS build secrets for real builds):

```
EXPO_PUBLIC_API_URL=https://<the-deployed-host>
```

No trailing slash — `lib/api.ts` appends `/api`.

## Verify

```bash
curl -fsS https://<host>/up                     # health, touches no database
curl -fsS https://<host>/api/catalog | head     # public, reads the catalogue
curl -isS https://<host>/api/orders | head -1   # must be 401 without a token
```

The third is the important one: a 200 there means the token middleware is not
running and every order endpoint is open.
