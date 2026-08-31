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
| `SUPABASE_JWT_SECRET` | **Usually leave empty.** The project signs with ES256 now, and the middleware verifies against the public JWKS at `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` — there is no secret to copy. Set it only for a project still issuing HS256 tokens. |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API. Signs garment-photo viewing URLs, and nothing else. **Secret** — it bypasses RLS entirely; server environment only, never an `EXPO_PUBLIC_*`. Leaving it unset costs the photos (they return null URLs) and breaks nothing else. |
| `SUPABASE_ANON_KEY` | Publishable; the admin console signs staff in with it. |
| `GOOGLE_MAPS_API_KEY` | Geocoding only. |

## Migrations — read before running

**Both migrations were applied to the Seoul project on 2026-08-27**, taking
`public` from 11 tables to 19 (`HANDOFF.md` section 0). The `orders.reward_id`
reconciliation that blocked them turned out to be a non-issue: neither
migration declares a foreign key against `rewards`, so there was no constraint
that could fail to line up.

They are still listed here because a **restored project needs them replayed**
if the dump predates them, and because the warning below always applies.

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
`--pretend` under-reports: in pretend mode `select()` returns an empty array,
so `Schema::hasTable()` reads false and any block guarded by it is dropped
from the preview. Read it as a lower bound.

## Then seed the prize pool

```bash
php artisan db:seed --class=RewardSeeder
```

Idempotent — it upserts the fifty prizes by (kind, title, tier) and
deactivates anything left under the retired tiers.

## Row Level Security

Against the **Seoul** project this is done: RLS is enabled on all 19 tables and
the three hotfixes are applied (`HANDOFF.md` section 0). `rls.sql` and
`rls_v2.sql` are superseded by those hotfixes for every table that exists —
do not run them expecting them to be current.

Against a **newly restored** project it is not done, and a dump can carry
policies without carrying column grants — the grant is what stops a customer
setting their own `role`. Replay in this order, from the Supabase SQL editor:

1. `hotfix_profiles_grant.sql`
2. `hotfix_2_order_writes.sql`
3. `hotfix_3_staff_accounts.sql`
4. `storage_order_photos.sql` — the private bucket the garment photos live in
5. `perf_indexes.sql`, **one statement at a time** (`CREATE INDEX
   CONCURRENTLY` cannot run inside a transaction and the SQL editor wraps a
   script in one)

Then re-run `rls_audit.sql`: every table must report `rowsecurity = true` and
query 5 must return zero rows. See `SECURITY.md` and
`scripts/migration/README.md`.

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
