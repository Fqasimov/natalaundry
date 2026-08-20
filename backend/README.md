# Nata Laundry — Laravel API

Business-logic API for Nata Laundry, running **against the same Supabase
Postgres database the mobile app already uses**. Nothing is migrated: the app
keeps its Supabase Auth session, and this service verifies those same access
tokens.

```
Expo app ──> Supabase Auth (unchanged, issues JWT)
   │
   └────────> Laravel API ──> Supabase Postgres (existing tables)
                    │
                    └─ owns: pricing, order lifecycle, gift boxes,
                             promo codes, wallet ledger
```

## Why the API owns pricing

The app computes an estimate locally so the basket can update instantly, but
it is never trusted. `OrderService::create()` re-resolves every line against
the server catalogue and recomputes the totals, so a tampered client can't
choose its own prices. `OrderServiceTest::test_it_ignores_prices_supplied_by_the_client`
pins that behaviour.

## Setup

```bash
composer install
cp .env.example .env
php artisan key:generate
```

Fill in `.env`:

| Variable | Where to find it |
| --- | --- |
| `DB_HOST`, `DB_PASSWORD` | Supabase Dashboard → Project Settings → Database |
| `SUPABASE_JWT_SECRET` | Supabase Dashboard → Project Settings → API → JWT Settings |

Then seed the gift-box prize pool:

```bash
php artisan migrate            # see the warning below first
php artisan db:seed --class=RewardSeeder
```

> **Before running `migrate` against production**, run
> `php artisan migrate --pretend` and read it. The only migration here creates
> the gift-box tables (`rewards`, `user_rewards`, `gift_box_openings`,
> `promo_codes`), each guarded by `Schema::hasTable`. It never alters or drops
> anything that already exists. But note `orders.reward_id` is already present
> in the live schema, which suggests a rewards table may exist under a name we
> haven't seen — reconcile that first.

## Testing

```bash
php vendor/bin/phpunit
```

33 tests run against in-memory SQLite. The live Supabase tables are mirrored
by `tests/Support/SupabaseSchema.php`, which is deliberately **not** a
migration — those tables exist in production and must never be created by this
codebase.

The pricing suite asserts the exact figures from the shipped 1.0.2 build
(₼37 subtotal + ₼5 delivery = ₼42 total), so it fails loudly if the rules
drift from what customers already see.

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/catalog` | Public price list |
| `GET` | `/api/profile` | Current user |
| `PATCH` | `/api/profile` | Update name / phone / language |
| `GET` | `/api/orders` | The caller's orders |
| `POST` | `/api/orders` | Create — repriced server-side, requires 3 photos |
| `POST` | `/api/orders/quote` | Live estimate, creates nothing |
| `GET` | `/api/orders/{id}` | Customer or assigned courier only |
| `POST` | `/api/orders/{id}/cancel` | Pending orders only |
| `GET` | `/api/orders/available` | Couriers: unclaimed jobs |
| `POST` | `/api/orders/{id}/claim` | Couriers: claim a pending job |
| `POST` | `/api/orders/{id}/advance` | Assigned courier advances one step |
| `GET` | `/api/gift-boxes` | Active rewards + box availability |
| `POST` | `/api/gift-boxes/open` | Draws a prize server-side |
| `GET` | `/api/wallet` | Balance + ledger |

All except `/api/catalog` require `Authorization: Bearer <supabase access token>`.

## Business rules

Everything lives in `config/nata.php` and mirrors `lib/pricing.ts` in the app.

- Free delivery at **₼40**; below that a **₼5** base fee applies
- Tier surcharge on top: Standart `+0`, Ekspres `+5`, Eko `+0`
- Outside-city delivery adds **₼5**
- Orders need **3 garment photos** before they can be submitted
- Gift-box rewards expire after **7 days**
- Daily bronze box: one free open per 24h; gold box: one per completed order;
  legendary VIP box: Nata Plus subscribers only

### One assumption worth checking

The video shows `Ekspres +10.00 ₼` while the basket was ₼37 (under the
threshold). That is modelled here as `base ₼5 + tier surcharge ₼5`. The
alternative reading — Ekspres is a flat ₼10 regardless of subtotal — produces
the same number in that one frame, so the video can't distinguish them.
If the real rule is flat, set `EXPRESS_IS_FLAT` in the app's `lib/pricing.ts`
and adjust `config/nata.php` to match.

## Auth

`AuthenticateSupabaseToken` verifies HS256 tokens with `SUPABASE_JWT_SECRET`,
checks `exp`/`nbf`, and resolves `sub` to a `profiles` row. If the project
migrates to Supabase's asymmetric JWT signing keys, swap the signature check
for the project's JWKS endpoint — the claim handling stays the same.

Note that RLS still applies to anything the app reads directly from Supabase;
this API connects as the database user in `.env`, so it is not constrained by
RLS and must enforce ownership itself. It does — every order query is scoped
to the caller.
