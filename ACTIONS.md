# What is left to do, and exactly how to do each of it

Written 2026-08-31, after the Seoul → Frankfurt move landed (`85833c9`).

Everything here needs a human — a password, a DNS panel, a dashboard toggle, or
a pair of eyes on a screen. Nothing in this list is code I could write.

They are ordered by what blocks what. **1 blocks 2 and 7. 7 blocks 8.**
3, 4, 5, 6 are independent and can be done in any order, today.

| # | Action | Blocks | Time |
|---|---|---|---|
| ~~1~~ | ~~Set the Frankfurt `DB_PASSWORD`~~ | ✅ done 2026-09-01 | — |
| ~~2~~ | ~~Verify the API talks to Frankfurt~~ | ✅ done 2026-09-01 | — |
| 3 | Point Auth SMTP at Resend | signups at volume | 10 min |
| 4 | Enable leaked-password protection | — | 1 min |
| 5 | Rotate the Seoul password, freeze the project | — | 5 min |
| 6 | Fix the SPF record | outbound mail deliverability | 5 min |
| 7 | Deploy the API in `eu-central-1` — [runbook](backend/DEPLOY.md) | every write path | ~1 h |
| 8 | Repoint `EXPO_PUBLIC_API_URL` before building | any store release | 2 min |
| 9 | Clear five orders' dead photo URIs — script ready | — | 1 min |
| 10 | Open the PR | — | 2 min |
| 11 | Manual click-through | a store release | 2 h |
| 12 | Revoke trigger `EXECUTE` — proven safe, script ready | — | 1 min |

---

## 1. Set the Frankfurt `DB_PASSWORD` — ✅ DONE 2026-09-01

Password set by the owner; connection verified. `backend/.env` now reads:

```
DB_HOST=aws-0-eu-central-1.pooler.supabase.com
DB_PORT=6543
DB_USERNAME=postgres.kzfsagccvxjmsbqjdpnb
DB_DATABASE=postgres
DB_PASSWORD=          ← set locally, gitignored, never committed
```

> **The host in the first draft of this file was wrong.** It said `aws-1-`,
> copied from the Seoul host without checking. The Frankfurt project is on the
> **`aws-0`** fleet, and the resulting failure was the exact trap described
> below — `ENOTFOUND tenant/user`, which reads like a rejected password and is
> not one. Probing all four host/port combinations found `aws-0` on both ports.
> The password was right the whole time.

> **It is not the Seoul password, even though it is the same Supabase account.**
> Database passwords are per *project*, not per account — Seoul and Frankfurt are
> separate Postgres instances with separate `postgres` roles. The username shows
> it: `postgres.dzplzvogobqmwaaimkef` versus `postgres.kzfsagccvxjmsbqjdpnb`.
> Same reason the anon key had to be swapped. The only thing the account shares
> is the dashboard login.

**Steps**

1. **First check whether you already have it.** Supabase makes you set or
   generate a database password when you create a project, so it may be in your
   password manager from the day the Frankfurt project was made. If it is, skip
   to step 3 — no reset needed.
2. Only if you do not have it: open
   <https://supabase.com/dashboard/project/kzfsagccvxjmsbqjdpnb/settings/database>
   → **Reset database password**. Generate a strong one and store it — Supabase
   will not show it again.
3. Open `backend/.env` in an editor and put it after `DB_PASSWORD=`.
   No quotes needed unless it contains `#` or spaces; if it does, wrap it in
   double quotes.
4. Save. **Do not commit it** — `backend/.env` is gitignored, and it must stay
   that way.

> **Port 6543 is deliberate.** That is the *transaction* pooler, which is what a
> Laravel request should use. Port 5432 is the *session* pooler — needed for
> `pg_dump`, `psql`, and DDL, but it holds a connection per client and will run
> you out of connections under real traffic.

---

## 2. Verify the API actually talks to Frankfurt — ✅ DONE 2026-09-01

All three checks passed. Kept here as the recipe for re-verifying after any
future move or restore.

```bash
cd backend && php artisan migrate:status
```

The three project migrations read `Ran`:
`create_gift_box_tables`, `add_order_lifecycle_tables`,
`give_courier_locations_subsecond_precision`.

> **Three migrations read `Pending`, and that is correct.**
> `0001_01_01_000000_create_users_table`, `_000001_create_cache_table` and
> `_000002_create_jobs_table` are Laravel's default stubs. They are unused —
> auth lives in Supabase `auth.users` + `public.profiles` — and they were
> `Pending` on Seoul too. **Do not run `php artisan migrate` to "fix" them.**
> It would create a `users` table in `public`, which PostgREST then exposes
> like any other, next to the real one.

Then confirm the data arrived intact through Laravel's own eyes, not just
Postgres's:

```bash
php artisan tinker --execute="echo App\Models\Order::count().' orders, total '.App\Models\Order::sum('total');"
```

Expect **15 orders** summing to **630.00** — confirmed. If the total is anything
else, stop: it would mean the trigger-disable during the restore did not hold,
and historical rows were rewritten on the way in.

For `order_items`, be precise about which figure you are checking — the two are
easy to confuse and only one of them is the one recorded at migration time:

| Measure | Value |
|---|---|
| rows | 31 |
| `sum(quantity)` | 45 |
| `sum(price)` | 312.00 |
| **`sum(price * quantity)`** | **423.00** ← the figure verified on both sides |

```bash
php artisan tinker --execute="print_r(DB::selectOne('select count(*) n, sum(price) sp, sum(price*quantity) spq from public.order_items'));"
```

Then run the suite:

```bash
cd backend && php artisan test
```

**112 passed, 535 assertions, ~32s.** Safe to run against any environment: the
tests are pinned to sqlite `:memory:` in `phpunit.xml` and never touch the real
database.

**If a connection fails with `FATAL: (ENOTFOUND) tenant/user ... not found`:**
that is **not** the password. It is a routing failure that happens *before*
authentication — the pooler is saying it does not host this project. Supabase
runs `aws-0-` and `aws-1-` fleets per region and a project sits on exactly one:

| project | fleet |
|---|---|
| Seoul `dzplzvogobqmwaaimkef` | `aws-1-ap-northeast-2` |
| **Frankfurt `kzfsagccvxjmsbqjdpnb`** | **`aws-0-eu-central-1`** |

**They are opposite, which is the whole trap** — carrying the prefix across from
the old host is what broke it here, and it has now cost time twice in this
project. Swap the prefix before touching credentials.

---

## 3. Point Supabase Auth's SMTP at Resend

**Why this is not optional.** Supabase's built-in mailer is rate-limited to a
handful of messages an hour and is explicitly not for production. It does not
error visibly — the signup succeeds and the confirmation email simply never
arrives. On your first busy afternoon you will get support messages, not logs.

Resend is already fully configured for the domain and its DNS is verified.

**Steps**

1. Get an API key: <https://resend.com/api-keys> → **Create API Key**, scope
   **Sending access**, domain `natalaundry.az`. Copy it — shown once.
2. Open <https://supabase.com/dashboard/project/kzfsagccvxjmsbqjdpnb/settings/auth>
3. Scroll to **SMTP Settings** → enable **Enable Custom SMTP**.
4. Fill in:
   | Field | Value |
   |---|---|
   | Sender email | `noreply@natalaundry.az` |
   | Sender name | `Nata Laundry` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | *the API key from step 1* |
5. Save, then **Rate Limits** → raise **emails per hour** from the default (it
   is pinned low while the built-in mailer is in use).
6. Test it: sign up a throwaway address in the app and confirm the mail lands.
   Check <https://resend.com/emails> for the delivery record if it does not.

---

## 4. Enable leaked-password protection

Supabase's own linter flags this, and it is a checkbox. It checks new passwords
against HaveIBeenPwned's breach corpus at signup.

1. <https://supabase.com/dashboard/project/kzfsagccvxjmsbqjdpnb/settings/auth>
2. **Password security** → turn on **Prevent use of leaked passwords**.
3. While you are there, set **Minimum password length** to at least 8.

---

## 5. Rotate the Seoul password, and freeze the project

The old project's database password was pasted into a chat transcript. Treat it
as public.

**Steps**

1. <https://supabase.com/dashboard/project/dzplzvogobqmwaaimkef/settings/database>
   → **Reset database password**. You never need to write the new one down; the
   point is only to invalidate the old one.
2. **Do not delete the project.** Keep it for a fortnight, until roughly
   **14 September 2026**, as your rollback. A migration that verified clean can
   still surface something a fortnight later, and there is no undo on a deleted
   project.
3. Optionally pause it (Settings → General → **Pause project**) to stop it
   accruing usage. Pausing is reversible; deleting is not.
4. After the fortnight, and only if nothing has surfaced: delete it.

---

## 6. Fix the SPF record

Unrelated to the migration, still outstanding, and it is silently costing you
deliverability today.

**The problem.** Your MX records point at Google Workspace, but SPF authorises
only Hostinger. Any mail you send from Google — every reply from a human at
`@natalaundry.az` — fails SPF and lands in spam or gets rejected outright.

**The fix.** In your DNS panel, edit the `TXT` record on the root (`@`) whose
value begins `v=spf1`, and set it to exactly:

```
v=spf1 include:_spf.google.com include:_spf.mail.hostinger.com ~all
```

**Steps**

1. Open your domain's DNS zone editor (wherever `natalaundry.az` is managed).
2. Find the existing `TXT` record at `@` starting `v=spf1`. **Edit it — do not
   add a second one.** Two SPF records is a permanent error: receivers see
   `permerror` and the domain fails, which is worse than the current state.
3. Paste the value above. Save.
4. Wait for TTL, then verify:
   ```bash
   nslookup -type=TXT natalaundry.az
   ```
   Exactly one `v=spf1` line should come back.
5. Confirm end to end at <https://www.mail-tester.com> — send it a mail from
   your Google Workspace address and check SPF passes.

> Resend does not need adding here; it sends from a subdomain with its own SPF,
> already verified.

---

## 7. Deploy the API in `eu-central-1`

**This is the largest remaining item and the one that actually matters.**
The Laravel API is not deployed anywhere. `EXPO_PUBLIC_API_URL` currently points
at `http://192.168.0.107:8000` — a laptop on your home Wi-Fi. Every write path
in the app (place order, pay, courier lifecycle, tracking) works only while that
laptop is on and the phone is on the same network.

Put it in `eu-central-1`, same region as the database. The API↔DB hop then costs
about **1 ms** instead of 88, and only the phone→API leg pays real distance.

### ▶ The full runbook is [`backend/DEPLOY.md`](backend/DEPLOY.md)

Written out step by step: install, create the app, set the seven secrets, deploy,
issue the certificate, add the DNS records, repoint the app. Everything that can
be prepared has been — `backend/Dockerfile` and `backend/fly.toml` are ready, so
the deploy itself is `fly deploy`. What is left needs an account, a card and your
DNS panel.

**Four things in the first draft of this section were wrong**, found while
preparing the files:

- **A `config:cache` in the Dockerfile would have broken the deploy**, in a way
  that reads as a credentials problem and is not. It resolves every `env()` at
  *build* time, and `.dockerignore` excludes `.env`, so it baked in `127.0.0.1`,
  port 5432, database `laravel`, user `root`, empty password, sslmode `prefer` —
  and those frozen values then *win* over what the platform injects at run time.
  Verified by building without `.env`: with `DB_HOST` set in the environment,
  config still reported `127.0.0.1`. Removed, with a comment saying why.
- **Do not generate a fresh `APP_KEY`.** Reuse the one in `backend/.env`. A new
  key invalidates every encrypted cookie and signed URL already issued.
- **No queue worker is needed.** `QUEUE_CONNECTION=sync`; nothing is dispatched
  to a queue. The earlier note about supervising `queue:work` was wrong.
- **The health endpoint is `/up`**, Laravel's built-in, already registered — not
  `/api/health`, which does not exist. It touches no database on purpose, so
  Postgres being slow can never take the API out of rotation.

**And one thing to know before you call it live:** `KAPITAL_BASE_URL` points at
`txpgtst.kapitalbank.az` — Kapital's *test* gateway — with their public sandbox
username. Real payments will not work until the bank issues production
credentials.

Do **not** put this on the Hostinger base plan: shared PHP hosting has no
persistent process and cannot run a container.

---

## 8. Repoint `EXPO_PUBLIC_API_URL` before any build

**Do this immediately before building, and check it every time.** A store build
carrying `http://192.168.0.107:8000` is a dead app for every user — and on iOS
it will not even connect, because ATS blocks plain HTTP.

In `.env`:

```
EXPO_PUBLIC_API_URL=https://api.natalaundry.az
```

Then verify it actually got baked in — Expo inlines these at build time, so a
stale cache is a real failure mode:

```bash
npx expo start --clear
```

and confirm a write path (place an order) reaches the deployed API, not the
laptop.

---

## 9. Clear five orders' dead photo URIs — one command

**This item was wrong in the first draft and the truth is much smaller.** There
are no "garment photos" and no catalogue image column: the catalogue lives in
`lib/catalog.ts` / `backend/config/catalog.php` and uses icons, not photographs.

What actually exists is five *orders* whose `item_photos` hold paths like

```
file:///Users/farid/Library/Developer/CoreSimulator/Devices/…/photo.jpg
```

— iOS Simulator paths from mid-August, three photos each, orders #7 to #11.

**It is not a live bug.** `lib/uploads.ts` already uploads to the private
`order-photos` bucket and stores the returned path, and
`app/checkout/summary.tsx:127` calls it. These rows predate that fix. The bucket
holds zero objects simply because no order has been placed through the fixed
flow yet — which needs the API deployed (item 7).

**Steps**

```bash
php scripts/migration/clear-legacy-photo-uris.php
```

Dry run: it lists the five orders and changes nothing. Then:

```bash
php scripts/migration/clear-legacy-photo-uris.php --apply
```

Only rows where *every* entry is a device-local URI are cleared. A mixed row —
one legacy URI beside a real uploaded path — is reported and left alone rather
than quietly half-emptied. There are none today, but that is the safe behaviour
if this is ever run again.

---

## 10. Open the PR

<https://github.com/Fqasimov/natalaundry/pull/new/feat/payments-auth-rls-ui>

I cannot open it for you — creating it publishes to GitHub on your behalf.

---

## 11. Manual click-through

**112 automated tests pass and no human has opened a single screen.** The
end-to-end test drives the whole journey over HTTP, which proves the API and the
data are right. It proves nothing about whether a button is reachable, whether
text is legible on the coastal palette, or whether the map renders.

Walk these, on a real device:

- Sign up → confirm email → sign in
- Home → service overview → add to order → cart appears **only on home**
- Checkout → payment → Kapital HPP redirect → return
- Order detail → live tracking → courier marker moves forward, never backwards
- Gift box open, spend prize
- Profile, gifts, toplu
- Courier app: claim → all nine lifecycle states → GPS pings → deliver

---

## 12. The deliberate pass on trigger-function `EXECUTE` grants

**The question is settled. One command is left to run.**

The open question was whether Postgres checks `EXECUTE` when a trigger *fires* —
if it does, revoking breaks signup and every order write.

`scripts/migration/trigger-grants-check.php` answers it with evidence rather than
argument. Everything runs inside a transaction that is **always rolled back**,
including the revokes and a real `auth.users` insert; grants are transactional in
Postgres, so nothing survives. It verifies afterwards that the grants and row
counts are identical to the start state.

**Result: safe.** A `SECURITY DEFINER` trigger with `EXECUTE` revoked from
`PUBLIC`, `anon` and `authenticated` still fired on an insert performed **as
`authenticated`**. Postgres checks `EXECUTE` when a trigger is *created*, not
when it runs.

> **The first version of that test was not trustworthy and was rewritten.** It
> inserted as `postgres`, a role privileged enough to sail past a permission
> check that would stop a real caller. The second attempt — inserting into
> `orders` as `authenticated` — could never have worked either: `orders` has RLS
> with **SELECT policies only**, so `authenticated` cannot insert at all, by
> design, because writes go through the API. The insert would have failed on RLS
> and said nothing about `EXECUTE`. The version that stands builds its own table
> and trigger inside the transaction, which isolates the question exactly.

Also confirmed: **nothing calls these functions directly.** No `.rpc()` in the
app, no direct invocation in the API — so the grant is not load-bearing anywhere
else.

**Steps**

```bash
php scripts/migration/trigger-grants-check.php   # optional: re-prove it
php scripts/migration/revoke-trigger-execute.php # apply
```

The revoke script is idempotent and verifies through `has_function_privilege`
rather than trusting that the commands worked — the same check that caught the
`PUBLIC` inheritance trap during the migration. **`PUBLIC` is revoked first**;
revoking only `anon`/`authenticated` reports success and changes nothing, because
both inherit from `PUBLIC`.

**Scope: the eleven functions in `public`.** The other four —
`enforce_bucket_name_length`, `protect_delete`, `update_updated_at_column` in
`storage`, and `subscription_check_filters` in `realtime` — belong to Supabase's
own admin roles. A `REVOKE` from `postgres` on those is a silent no-op, and they
are not ours to change.

I could not run the apply step myself: it is a write against the production
database and was blocked, correctly.

---

## What I already did, for reference

Nothing in this list needs redoing:

- Database moved Seoul → Frankfurt, verified row for row (19 tables, 13 users,
  13 bcrypt hashes, 32 policies, 19 functions, 10 triggers, both money totals to
  the cent). Nobody resets a password.
- Three security regressions the restore introduced, found and closed: full
  `UPDATE` on `profiles` for `authenticated`; missing `SET search_path` on all 19
  functions; and `settle_payment_intent` — `SECURITY DEFINER`, credits the
  wallet, no auth check — becoming callable by `anon`.
- Signup trigger and `order-photos` bucket recreated (both live outside a
  `--schema=public` dump).
- Six missing indexes on hot queries, applied.
- The courier-marker backwards-jump fixed, at the query, the model, and the
  column precision.
- App and API `.env` repointed at Frankfurt.

Detail in [`scripts/migration/MIGRATION_LOG.md`](scripts/migration/MIGRATION_LOG.md)
and [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md).
