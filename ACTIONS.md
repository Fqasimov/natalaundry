# Shipping the update — every step, in order

Last verified 2026-09-01. Target: **100–500 concurrent users**, which needs no
architecture change — see [Capacity](#capacity) at the end.

Work top to bottom. **Phases 0–2 must be finished before you build anything**,
because the build bakes in addresses that must already be live.

| Phase | What | Time |
|---|---|---|
| 0 | Two secrets, and the Seoul password | 15 min |
| 1 | Deploy the API | ~1 h |
| 2 | Email, so signups work | 15 min |
| 3 | The Seoul → Frankfurt cutover | 20 min |
| 4 | Build, test, submit | 2–3 h |
| 5 | After it's live | ongoing |

---

## The thing to understand before starting

**Your live App Store app talks to Seoul, not Frankfurt.** The Frankfurt project
was created on 2026-08-31; the shipped build predates it, and Expo compiles the
Supabase URL and key into the binary at build time. They cannot be changed
remotely.

So the migration did not move production — **it made a copy.** Frankfurt has
received no writes since it was restored. Production moves when users install
the new build, one by one, over days.

That is what Phase 3 is for, and it is the step most likely to lose data if
skipped.

---

## Phase 0 — before anything else

### 0.1 Two missing secrets (5 min)

`backend/.env` has two empty values. They are project-scoped and changed with
the region move.

Supabase → **Frankfurt project** → Project Settings → API:

```
SUPABASE_JWT_SECRET=          ← "JWT Secret" (under JWT Settings)
SUPABASE_SERVICE_ROLE_KEY=    ← "service_role" key, the secret one
```

> Every API request is verified with `SUPABASE_JWT_SECRET`. Empty means the API
> rejects **everyone**, including you, and the error will not say why.

`SUPABASE_ANON_KEY` and `GOOGLE_MAPS_API_KEY` are already filled — copied from
the root `.env`, which held the Frankfurt values.

**Check the Maps key.** It came from the client `.env`. If it is restricted to
iOS/Android apps in Google Cloud, server-side geocoding will fail with it and
you need a separate server key restricted by IP.

Verify:

```bash
php scripts/deploy/set-fly-secrets.php
```

It lists every secret as present or missing and refuses to go on if any is
missing. It sends nothing without `--apply`.

### 0.2 Reset the Seoul password, and keep it (10 min)

Needed twice over: the old one was pasted into a chat transcript, and Phase 3
needs a working connection to Seoul.

1. Supabase → **Seoul project** (`dzplzvogobqmwaaimkef`) → Settings → Database →
   **Reset database password**
2. Save it in `scripts/migration/seoul.env` (gitignored — never committed):

```
DB_HOST=aws-1-ap-northeast-2.pooler.supabase.com
DB_PORT=5432
DB_DATABASE=postgres
DB_USERNAME=postgres.dzplzvogobqmwaaimkef
DB_PASSWORD=<the new one>
```

**Note the fleet: Seoul is `aws-1`, Frankfurt is `aws-0`.** They are opposite.
Getting it wrong gives `FATAL: (ENOTFOUND) tenant/user … not found`, which reads
exactly like a wrong password and is not one. It has cost time twice already.

**Do not pause or delete the Seoul project.** It is serving your live app right
now, and will keep serving every user who has not updated.

---

## Phase 1 — deploy the API

**Nothing else unblocks until this is done.** `EXPO_PUBLIC_API_URL` currently
points at `http://192.168.0.107:8000` — a laptop on your home Wi-Fi. In a store
build that is dead twice over: a private address nobody can route to, and plain
HTTP, which iOS App Transport Security blocks outright.

Full runbook: **[`backend/DEPLOY.md`](backend/DEPLOY.md)**. Summary:

1. `fly auth login` — yours; I cannot sign in or authorise billing
2. `fly apps create natalaundry-api` — **not `fly launch`**, which would
   overwrite the `fly.toml` already written
3. `php scripts/deploy/set-fly-secrets.php --apply` — pipes secrets from
   `backend/.env` through stdin, never a command line, never a file
4. `fly deploy` — builds remotely; **no local Docker needed**
5. `fly certs add api.natalaundry.az`, then add the `A` and `AAAA` records it
   prints. **This DNS record does not exist yet.**

### Verify before moving on

```bash
curl -fsS https://api.natalaundry.az/up
```
```bash
curl -fsS https://api.natalaundry.az/api/catalog | head -c 200
```
```bash
curl -isS https://api.natalaundry.az/api/orders | head -1
```

The third **must return 401**. A `200` means the token middleware is not running
and every order endpoint is open to the internet. Do not point the app at a
deployment that answers anything else.

---

## Phase 2 — email

### 2.1 SMTP → Resend (10 min)

**This is a launch blocker, not housekeeping.** Email confirmation is switched on
— 4 of your 13 accounts never confirmed. Supabase's built-in mailer is capped at
a few messages an hour and **fails silently**: signup succeeds, the mail never
arrives, and the user simply cannot get in.

Resend is already configured for the domain with DNS verified.

1. <https://resend.com/api-keys> → create a key, sending access, `natalaundry.az`
2. Supabase → **Frankfurt** → Authentication → SMTP Settings → enable custom SMTP

   | Field | Value |
   |---|---|
   | Sender | `noreply@natalaundry.az` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | *the API key* |

3. Raise the **emails per hour** rate limit — it is pinned low while the
   built-in mailer is in use
4. Sign up a throwaway address and confirm the mail lands

### 2.2 Leaked-password protection (1 min)

Same Auth settings page → **Prevent use of leaked passwords**. One checkbox.

---

## Phase 3 — the cutover

Skip this and orders placed by real users in the last days can silently vanish.

### 3.1 Find out whether it matters

```bash
php scripts/migration/seoul-delta.php
```

Compares every table in Seoul against Frankfurt and reports what Seoul has that
Frankfurt does not. Read-only — it writes nothing to either.

**If it reports zero new rows**, the split is theoretical and you can proceed
straight to Phase 4. Given the last order was 2026-08-17 and the last signup
2026-08-29, this is the likely outcome — but check rather than assume.

### 3.2 If there are new rows

Tell me and I will write the sync. It is not a re-run of the migration: it has to
insert only what is new, keep UUIDs, and not disturb what is already in
Frankfurt.

**Run it as late as possible** — ideally the day you submit — so the window of
divergence is as short as it can be.

### 3.3 Accept the tail

Users on the old build keep writing to Seoul until they update. That is
unavoidable with a store release. So:

- **Keep Seoul running** until adoption is high — weeks, not days
- Re-run `seoul-delta.php` weekly and sync stragglers
- Only when it reports nothing for a fortnight is Seoul safe to retire

---

## Phase 4 — build and submit

### 4.1 Repoint the app

In the **root** `.env`:

```
EXPO_PUBLIC_API_URL=https://api.natalaundry.az
```

**No trailing slash** — `lib/api.ts` appends `/api` itself. Also confirm
`EXPO_PUBLIC_SUPABASE_URL` is the Frankfurt one (it is).

**Set these in the EAS build secrets too.** Expo inlines them at build time; the
local file does not travel with an EAS build.

### 4.2 Clear the cache

```bash
npx expo start --clear
```

A stale cache baking the old LAN address into the bundle is a real failure mode,
and one you would only discover after review.

### 4.3 Walk it on a real device

**146 tests pass and no human has opened a screen.** The suite proves the API and
the data are right. It says nothing about whether a button is reachable or the
map draws.

- Sign up → confirm email → sign in
- Home → service → add to order → cart appears **only on home**
- Checkout → payment → Kapital redirect → return
- Order detail → live tracking → **courier marker moves forward, never backwards**
- Gift box open, spend prize
- Profile, gifts, toplu, Nata Balance top-up
- Notification inbox — rows must show text, not blanks
- Courier: claim → nine lifecycle states → GPS → deliver

Check it in **all three languages**. Most i18n bugs so far were invisible in
Azerbaijani.

### 4.4 Payments — decide before submitting

`KAPITAL_BASE_URL` is `txpgtst.kapitalbank.az`, Kapital's **test** gateway, with
their public sandbox username. **Card payments will not take real money.**

Cash is a first-class method — 7 of your 15 orders are cash — so you can ship
cash-only. If you do, **hide the card option** rather than leave it failing
against a sandbox, which may report success without charging anything.

Otherwise: get production credentials from Kapital, set them as secrets, and set

```
KAPITAL_CALLBACK_URL=https://api.natalaundry.az/api/payments/callback
```

The bank calls that directly, so it must be publicly reachable over HTTPS.

### 4.5 Build and submit

```bash
npx tsc --noEmit
```
```bash
cd backend && php artisan test
```

Both must be clean — `tsc` exit 0, 146 tests passing. Then build and submit
through EAS as usual.

---

## Phase 5 — after it's live

1. **Watch `seoul-delta.php` weekly.** Sync stragglers, retire Seoul only when it
   has been quiet a fortnight.
2. **Fix SPF.** Unrelated to the app, still outstanding. Your MX points at Google
   but SPF authorises only Hostinger, so replies from humans at
   `@natalaundry.az` fail SPF. **Edit the existing `TXT` record — do not add a
   second**, which is a permanent error and worse than the current state:
   ```
   v=spf1 include:_spf.google.com include:_spf.mail.hostinger.com ~all
   ```
3. **Open the PR** —
   <https://github.com/Fqasimov/natalaundry/pull/new/feat/payments-auth-rls-ui>

---

## Capacity

Measured against the live Frankfurt database, 2026-09-01.

```
max_connections     60          in use: 14, active: 1
shared_buffers      224MB       database size: 12MB
```

**60 connections is the wall**, and it is not 60 users. On port **6543**, the
transaction pooler, a connection is held only for the length of a query, so
hundreds of concurrent users share those 60 comfortably. On port **5432** the
session pooler holds one per client and dies at literally 60. `fly.toml` and
`backend/.env` are both correctly on 6543 — **keep them there.**

The database is 12MB and fits in `shared_buffers` many times over, so reads are
served from RAM. Every hot path is indexed; there are no sequential scans where
it matters. Query counts are flat with data volume, pinned by `QueryBudgetTest`,
which measures the same endpoint at 5 and 40 orders and asserts the count is
identical — so there is no N+1 waiting to appear at scale.

**For 100–500 concurrent users: no change needed.** One `shared-cpu-1x` machine
and the current Supabase tier carry it, provided the API is in Frankfurt.

The catalogue read measures **270 ms median from a laptop in Baku** — of which
perhaps 2 ms is Postgres and the rest is distance. Deploying the API in Frankfurt
is what collapses that, because the phone then pays the distance once per
request instead of once per query.

**What would actually break it** is not user count:

1. The API not deployed — every write fails, at any load
2. Running the app on port 5432 — dies at 60 users
3. A skipped cutover — not a crash, but silently wrong data, which is worse

---

## Already done — nothing here needs redoing

- Database moved Seoul → Frankfurt, verified row for row; pooler handshake
  324 ms → 88 ms
- Three security regressions the restore introduced, found and closed —
  including `settle_payment_intent` becoming callable by `anon`
- `EXECUTE` revoked on all 11 public trigger functions, after proving in a
  rolled-back transaction that triggers still fire without it
- Six missing indexes on hot queries
- The courier-marker backwards-jump, fixed at query, model and column precision
- `wallet_topups` created and secured; `notifications` given the `title` and
  `body` columns it was missing — **that was the blank inbox**
- Eight stray Laravel stub tables dropped after an accidental bare `migrate`,
  and the ledger corrected

Detail in [`scripts/migration/MIGRATION_LOG.md`](scripts/migration/MIGRATION_LOG.md)
and [`backend/DEPLOY.md`](backend/DEPLOY.md).
