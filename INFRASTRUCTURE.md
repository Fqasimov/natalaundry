# Infrastructure, capacity, and what to do about it

Written 2026-08-31, from measurements taken against production rather than
estimates. Read `HANDOFF.md` first for the state of the code; this file is
about where it runs and how much it can carry.

Companion page (same content, easier to share):
https://claude.ai/code/artifact/44f27425-f126-4eb3-a106-59e53122e8e7

---

## 1. The two facts that matter

### The API is not deployed

`api.natalaundry.az` has **no DNS record**. `EXPO_PUBLIC_API_URL` points at it
with no fallback — deliberately, because `lib/api.ts` throws rather than
falling back to a direct table write, and the comment explains why: a fallback
*"would look like it worked and quietly let the client set its own prices."*

So in every build shipped so far, these all fail on first tap:

- placing an order
- payment
- cancelling
- courier claim and every lifecycle transition
- live tracking, both the pings and the map
- opening a gift box

What still works, because it reads Supabase directly: signup, login, browsing,
profile, order history, and the gift-box screen's labelled demo fallback.

A customer can install the app, sign up, browse, fill a basket, and then hit a
dead end at the one action the business runs on.

### The database is in Seoul

`DB_HOST` is `aws-1-ap-northeast-2` — Seoul. The users are in Azerbaijan.
Measured from the development machine in Baku, 27 Aug 2026:

| | Median |
|---|---|
| TCP handshake to the Supabase pooler | **375 ms** |
| A single `select 1` | **1,023 ms** |
| TCP handshake to a Cloudflare edge (baseline) | 22 ms |
| Google | 74 ms |

The 22 ms baseline is the point: the connection is fine, the distance is not.
A request making four sequential queries pays roughly **four seconds of pure
network** before any application work. One PHP worker manages about 0.7
requests per second.

This is not tunable. No amount of indexing or caching changes the speed of
light.

---

## 2. What the hardware is

```
PostgreSQL 17.6 on aarch64        max_connections        60
shared_buffers        224 MB      effective_cache_size  384 MB
parallel workers           2      database size          13 MB
```

The smallest Supabase tier — roughly 2 vCPU, 1 GB RAM. Nineteen tables, 29 RLS
policies, 19 functions, 10 triggers. Extensions: `pgcrypto`, `uuid-ossp`,
`pg_stat_statements`, `supabase_vault`, `plpgsql`.

**Free tier pauses a project after seven days of inactivity.** Survivable in
development, not in production.

---

## 3. What is actually good

The application layer is not the bottleneck, and it is worth saying so plainly
because every instinct says to go looking there first.

Query counts per request, measured at 40 orders:

| Endpoint | Queries |
|---|---|
| `GET /api/catalog` | **0** (served from config) |
| `GET /api/profile` | 1 |
| `GET /api/orders` | 4 |
| `GET /api/orders/{id}` | 3 |
| `GET /api/admin/orders` | 4 |
| `GET /api/lifecycle/available` | 3 |
| `GET /api/orders/{id}/location` | 4 |
| `GET /api/gift-boxes` | 4 |

Every one of these is **flat** — the same count at 5 orders and at 40. No N+1
anywhere. `QueryBudgetTest` pins that shape by measuring at two data sizes and
failing if the counts differ, so an N+1 introduced later trips a test rather
than a customer.

---

## 4. Capacity

Live tracking dominates everything else. At `ping_seconds = 5`, each **active
delivery** costs 24 requests a minute — the courier posting twelve, the
customer polling twelve. Browsing costs a fraction of that, so the delivery
figure is the one that binds.

| | Today | Road A: Supabase EU | Road B: Hostinger VPS |
|---|---|---|---|
| DB round trip | ~1,020 ms | ~20–30 ms | **<1 ms** |
| API request (4 queries) | n/a | ~110–160 ms | ~15–30 ms |
| Concurrent live deliveries | **0** | 60–120 | 80–150 (KVM 1) · 250–400 (KVM 2) |
| Concurrent users browsing | **0** | 300–800 | 1,000–3,000 |
| Orders per day | 0 | thousands — never the constraint | |
| Backups / auth security / RLS | Supabase | Supabase | **You** |
| Monthly cost | $0 | $0–25 + API host | ~$6–14 all-in |
| Work to get there | — | **2–4 days** | 1.5–2 weeks |

Concurrency figures are arithmetic from the measurements above combined with
the ping rate. They are estimates and should be replaced by a real load test
before launch.

**Decision: Road A.** It fixes both measured problems in a few days without
touching authentication, and it is reversible. Road B is a better end state on
cost and speed, but it trades a fortnight plus three permanent
responsibilities for headroom that does not matter below ~120 simultaneous
deliveries. Launch on A; revisit with real traffic.

### Why the region cannot be changed in place

Supabase fixes a project's region at creation. There is no dashboard toggle;
the documented path is new project, dump, restore. Paid plans have
historically been able to request a move through support — worth asking before
doing it by hand.

**The App Store release this implies is not an extra cost.** A new project
means a new URL and anon key, both compiled into the bundle — but the app also
needs a release to get a working `EXPO_PUBLIC_API_URL`, which it has never
had. The build is required either way.

If you move to Pro, set up a **custom domain** for the project at the same
time (`db.natalaundry.az`). Then the app ships a hostname you control and any
future move is a DNS change rather than a store release.

---

## 5. Road A, step by step

### Preparation

1. **Create a new project in `eu-central-1`** (Frankfurt). Same organisation.
   Set a strong database password and keep it in a password manager. Note the
   project ref, URL and anon key.
2. **Enable the extensions the dump expects**: `pgcrypto`, `uuid-ossp`,
   `pg_stat_statements`. Skip `supabase_vault` — nothing in this codebase
   reads it.
3. **Dump while the old project is quiet.**
   `pg_dump --schema=public --schema=auth --no-owner --no-privileges`.
   The `auth` schema carries the 13 users and their bcrypt hashes; leave it
   out and everyone loses their account.

### Cutover

4. **Restore into the new project.** Errors about Supabase-managed objects
   that already exist are harmless. Errors naming `public.` tables are not —
   stop and read them.
5. **Verify the security model survived.** Re-run `rls_audit.sql`. All 19
   tables must report `rowsecurity = true`, and query 5 must return zero rows.
   A dump can carry policies without carrying column grants, and the grant is
   what stops a customer setting their own `role`.
6. **Replay the policy files, in order**: `hotfix_profiles_grant.sql`,
   `hotfix_2_order_writes.sql`, `hotfix_3_staff_accounts.sql`,
   `storage_order_photos.sql`, then `perf_indexes.sql` **one statement at a
   time** (`CREATE INDEX CONCURRENTLY` cannot run inside a transaction, and
   the SQL editor wraps scripts in one). Confirm nothing built invalid:
   `select indexrelid::regclass from pg_index where not indisvalid;`
7. **Point Supabase Auth's SMTP at Resend.** The built-in mailer is a
   development convenience capped at a handful of messages an hour — enough to
   make signup and password reset fail silently on the first busy afternoon.
   Resend's DNS is already published and verified, so this is a host, a port
   and an API key in the Auth settings.
8. **Repoint the backend**: `DB_HOST`, `DB_USERNAME`, `DB_PASSWORD`,
   `SUPABASE_URL`. The JWKS URL follows `SUPABASE_URL`, so ES256 verification
   moves with it and there is no secret to copy.
9. **Deploy the Laravel API.** Same region as the new project. PHP-FPM behind
   nginx, never `artisan serve` (single-threaded, one request at a time). Add
   the missing `api.natalaundry.az` A record and issue a certificate.
10. **Add the scheduler cron**, or the pruning job never runs:
    `* * * * * cd /path/to/backend && php artisan schedule:run >> /dev/null 2>&1`
11. **Rebuild the app and submit.** New `EXPO_PUBLIC_SUPABASE_URL`, new anon
    key, real `EXPO_PUBLIC_API_URL`. Walk the whole journey on a device first.
12. **Keep the Seoul project read-only for a fortnight.** Do not delete it
    until the new build has been live long enough that nobody is on the old
    one.

---

## 6. Fixed during this audit

### Six missing indexes (applied to production)

Four of the hottest queries in the system had no index and were doing
sequential scans — invisible at 15 orders, a table scan on every screen at
50,000:

- `orders.user_id` — every customer, every app open
- `orders.courier_id` — the courier's job list
- `order_items.order_id` — every order detail, and the fastest-growing table
- `payments.order_id` — every status poll and every bank callback

Built `CONCURRENTLY` so nothing took a write lock. See `perf_indexes.sql`.
They live in a `.sql` file rather than a migration because `CREATE INDEX
CONCURRENTLY` cannot run inside a transaction and Laravel wraps migrations in
one.

### The courier marker jumped backwards

`courier_locations.recorded_at` was `timestamp(0)` — whole seconds, which is
what `$table->timestamp()` produces in Postgres. Couriers ping every few
seconds, so two fixes in one second is ordinary. `TrackingController::show`
took the newest row with a single `orderByDesc('recorded_at')`, and on a tie
Postgres may return either — so the customer's map could be handed an older
fix than it already had.

Fixed in three places, because any one alone is insufficient: the column
widened to `timestamp(6)`, `CourierLocation::$dateFormat` carrying
microseconds, and `created_at` added as a tiebreaker.

Found by `EndToEndJourneyTest`, which passed alone and failed in the full
suite — the shape of a real ordering bug rather than a flaky test.

### Garment photos were never uploaded

Every one of the 15 photo paths in production was a `file://` or `content://`
device URI. They went into `orders.item_photos` and back out through
`OrderResource` to couriers and admins, for whom they resolve to nothing. The
damage-dispute evidence trail the feature exists to provide did not exist.

Now uploaded on capture to a private `order-photos` bucket
(`storage_order_photos.sql`), path `<user-id>/<random>.<ext>`, with the order
recording the storage path. Private rather than public because these are
photographs of customers' clothing inside their homes.

**The other half is still missing: no screen displays `item_photos` to
anyone.** The data is real now; showing it is unbuilt.

### The GPS table had no pruning job

`retain_hours` had been in config since tracking was written, and the
migration says *"prune old rows on a schedule"* — the schedule was never
written. One active delivery writes ~720 rows an hour; twenty concurrent over
an eight-hour day is ~115,000 rows, about 29 MB with indexes. On a 500 MB
database that is a hard stop inside a fortnight, arriving as write failures on
live orders.

`nata:prune-locations`, scheduled hourly, chunked so it never takes a long
lock on the table serving live tracking reads.

### Staff accounts could not be created

Two defects, both live, found trying to create a courier and an admin:

- `profiles_role_check` allowed only `'user'` and `'courier'`, while
  `AdminController`, `PaymentController`, `TrackingController` and
  `OrderLifecycleService` all gate on `role === 'admin'`. The application
  demanded a value the database rejected, so no admin had ever been possible.
- `handle_new_user()` read `name` and `phone` out of `raw_user_meta_data`
  while both columns were `NOT NULL` and `phone` was `UNIQUE`. The dashboard's
  *Add user* form sends no metadata, so both resolved to `NULL`, the insert
  violated `NOT NULL`, and Supabase reported only "Database error creating new
  user". Any signup path without both fields hit this.

See `hotfix_3_staff_accounts.sql`. `phone` is now nullable (many `NULL`s are
fine under a unique index; a shared placeholder would collide), and `name`
falls back to the email's local part.

### Two migrations that had never run

The live schema went from 11 tables to 19. Courier job offers, live tracking,
the order timeline, gift boxes and promo codes can now work against production
for the first time. RLS enabled on all 19, `rewards` seeded with the 50-prize
pool, ILK20 present as a real `promo_codes` row.

---

## 7. Still to do

### Needs a person (I cannot do these)

- **Fix the SPF record.** The apex publishes
  `v=spf1 include:_spf.mail.hostinger.com ~all`, which authorises Hostinger
  and nothing else — but the MX points at Google, so mail sent from a
  `@natalaundry.az` Workspace address fails SPF today. Change it to
  `v=spf1 include:_spf.google.com include:_spf.mail.hostinger.com ~all`.
  Resend does not need adding; it sends from the `send.` subdomain, which
  carries its own SPF.
- **Create the EU Supabase project** and set its password.
- **Confirm which Hostinger plan.** Headers say `platform: hostinger` behind
  `hcdn`, which is how their managed hosting answers; a VPS would reply as
  nginx or Apache. Not proof. hPanel settles it — a *VPS* section with SSH
  details means KVM.
- **Move DMARC from `p=none` to `p=quarantine`** once SPF is fixed and reports
  have been watched for a fortnight.

### Before any release build

- **Revert `EXPO_PUBLIC_API_URL`.** It is pointed at `http://192.168.0.107:8000`
  — the development laptop — so that the write paths work for local testing.
  A store build carrying that is useless to everyone.
- **Production `.env`**: `APP_ENV=production`, `APP_DEBUG=false` (debug mode
  leaks stack traces containing database credentials), Redis for cache and
  sessions, a real queue driver, `config:cache` and `route:cache`.
- **`QUEUE_CONNECTION=sync`** runs every notification and email inline inside
  the request. One slow push call and the customer's "confirm order" spins.
- **`CACHE_STORE=file`** keeps rate-limiter state in local files, so it is
  per-server. Two app servers means your 20-orders/hour limit becomes 40.
- **Walk the app by hand.** 112 tests pass and no human has opened a single
  screen.

### Known gaps, not blockers

- No screen displays `item_photos`.
- Courier and admin photo viewing needs an API endpoint issuing signed URLs —
  they have no storage grant, deliberately, because a storage policy cannot
  express "the courier assigned to this order".
- Forbidden-role requests return **422, not 403**:
  `OrderLifecycleController::guard()` folds them in with forbidden state
  changes. Documented behaviour, but a client cannot tell "never allowed" from
  "not from this state" by status code.
- Supabase Edge Functions have never been checked. If any exist they are real
  deployed code that a migration would have to carry.

---

## 8. Environment notes

- **The Supabase pooler host moved.** `aws-0-ap-northeast-2` answers on both
  ports but rejects this project with `ENOTFOUND tenant/user` — a routing
  failure that happens *before* authentication, so it looks nothing like a bad
  password and will send you hunting through credentials. The project is on
  `aws-1-*`.
- **Migrate on port 5432, run the app on 6543.** 6543 is the transaction
  pooler; Laravel's schema builder needs the session pooler. Put it back
  afterwards.
- **`--pretend` under-reports.** In pretend mode Laravel's `select()` returns
  an empty array, so `Schema::hasTable()` reads false and any block guarded by
  it is dropped from the preview. Read it as a lower bound, not a manifest.
- **Laravel creates its own `migrations` table in `public`**, which Supabase
  exposes through PostgREST like any other. It is named in no policy file; RLS
  was enabled and all grants revoked by hand. Do the same for anything else
  Laravel adds there.
- **PowerShell corrupts UTF-8 files.** A read-modify-write round trip turns
  every Azerbaijani schwa and every Cyrillic character into mojibake, silently.
  Edit non-ASCII files with a Node script or an editor that preserves encoding.
- **`git push` needs Windows OpenSSH**; git's bundled ssh fails to resolve
  github.com. `$env:GIT_SSH_COMMAND = '"C:\WINDOWS\System32\OpenSSH\ssh.exe"'`.
