# Nata Laundry — session handoff

Written 2026-08-25. Hand this to a new session so it starts with the context
rather than rediscovering it.

Branch: **`feat/payments-auth-rls-ui`** (pushed, not merged)
Open a PR: https://github.com/Fqasimov/natalaundry/pull/new/feat/payments-auth-rls-ui

---

## Read these first

- `SECURITY.md` — what was found and fixed, including two entries that were
  previously recorded as fixed but were not
- `SCHEMA_NOTES.md` — the **confirmed** live table list, and the seven tables
  this codebase expects that do not exist in production
- `backend/database/policies/` — audit queries and policy files

---

## 1. Do these first, they are still open

### Rotate two credentials — both were pasted into a chat transcript

- **Database password** — Supabase → Project Settings → Database → reset
- **JWT secret** — Project Settings → API → JWT Settings

The JWT secret rotation is now harmless: the project signs with ES256 and the
API verifies against the public JWKS, so nothing reads that secret any more.

### Two migrations have never been run against production

Confirmed by querying `pg_class` directly. The live `public` schema contains
**exactly eleven** tables:

```
courier_details, customer_details, notifications, order_items, order_offers,
orders, payment_intents, payments, profiles, service_prices, wallet_transactions
```

Missing, and the features that need them:

| Table | Migration | Feature that is broken without it |
|---|---|---|
| `order_status_logs` | `2026_08_21_000001_add_order_lifecycle_tables` | order timeline |
| `courier_assignments` | same | courier job offers |
| `courier_locations` | same | live tracking |
| `rewards`, `user_rewards`, `gift_box_openings` | `2026_08_20_094021_create_gift_box_tables` | gift boxes |
| `promo_codes` | same | promo codes, ILK20 |

Run `php artisan migrate --pretend` first. `orders.reward_id` already exists
live with no rewards table behind it — reconcile that before the gift-box
migration or the foreign key will not line up.

Then run `backend/database/policies/rls_pending_migrations.sql`, which is held
back precisely because naming a missing table aborts a transaction.

### `rls_v2.sql` is written but not applied

Reconciled against the real schema. Apply after the above, and re-run
`rls_audit.sql` query 4 afterwards to confirm no `anon` row holds
INSERT/UPDATE/DELETE anywhere.

### `is_my_assigned_courier(id)` source was never recovered

It backs a live `profiles` policy and is `SECURITY DEFINER` in `public`, which
means anyone can call it. Its sibling `is_assigned_courier_for` checks
`auth.uid()` internally; confirm this one does too:

```sql
select pg_get_functiondef(oid) from pg_proc where proname = 'is_my_assigned_courier';
```

---

## 2. What was fixed this session

### Three live security holes, all confirmed against production

**Profile privilege escalation.** `authenticated` held UPDATE on `role`,
`wallet_balance`, `points`, `is_subscribed`, `subscription_expires_at` and
`id`. Any signed-in user could make themselves an admin or set their own
balance. RLS selects *rows*, and this was the user's own row, so no policy
could have stopped it — Postgres has no column-level RLS, and a table grant is
the only mechanism that fences off columns.
Closed by `hotfix_profiles_grant.sql`.

**Client-priced orders — previously recorded as fixed, wasn't.** `orders` and
`order_items` still carried `"Users can insert their own ..."` INSERT
policies. Those check *whose* order it is, never what is in it, so anyone with
the anon key could POST to PostgREST and insert an order at `total = 0.01`.
The earlier fix had rerouted the app through the API but never touched the
database. Closed by `hotfix_2_order_writes.sql`.

**Courier could rewrite any column on a pending order.** `"Couriers can update
orders"` had `WITH CHECK = null`, so Postgres reused `USING` as the check.
That expression constrained only `courier_id`, `status` and role — every other
column, `total` included, was writable. Closed in the same hotfix.

### ES256 / JWKS authentication

The project has migrated to asymmetric ES256 signing. The middleware only
accepted HS256, so it would have rejected **every real token** regardless of
what was in `SUPABASE_JWT_SECRET`. Verification now goes through the project's
public JWKS (`app/Support/SupabaseJwks.php`), with caching and rotation-aware
refresh. HS256 is kept for unmigrated projects and the test suite.

The algorithm is matched against an allow-list rather than taken from the
token. Tests cover `alg: none` and algorithm confusion (EC public key used as
an HMAC secret).

**This needs no secret** — JWKS is public. `SUPABASE_JWT_SECRET` can stay empty.

### Kapital Bank payments

Hosted-payment-page redirect flow. Card and cash both work end to end; cash
settles outside the gateway.

Two invariants, both covered by `PaymentTest`:
- The amount is read from `orders.total`, never from a request body
- Paid status comes from `GET /order/{id}`, never from the browser redirect —
  that callback must be public, so anyone can open it with `STATUS=FullyPaid`

**Apple Pay / Google Pay are built but disabled** behind
`KAPITAL_WALLETS_ENABLED=false`. The documented API reports
`"paymentMethods": ["Card"]` and exposes no endpoint that accepts a wallet
token, so a native sheet has nothing to submit to. Enabling the flag shows the
buttons and routes them through the same hosted page. **Ask Kapital whether
wallet acceptance is enabled on the merchant terminal before turning it on** —
otherwise a customer taps "Apple Pay" and lands on a card form.

### Seven UI changes

Address picked on a map (real coordinates, not a typed string); garment photos
no longer mandatory on either side; floating cart button with count badge;
gift boxes fall back to a labelled local sample when the API is unreachable so
the animation can be seen without a backend; membership levels removed
entirely; text-overflow fixes; `TrackingMap` no longer forces
`PROVIDER_GOOGLE`, which had made it unusable in Expo Go on iOS.

### Expo SDK 51 → 54

React 19, RN 0.81. Two migration traps that cost time: the worklets Babel
plugin moved out of `react-native-reanimated` into `react-native-worklets`,
and `babel-preset-expo` needed to be an explicit dependency so npm hoists it.

---

## 3. Environment notes for the next session

- **PowerShell corrupts UTF-8 files.** `Get-Content` reads as ANSI by default;
  a read-modify-write round trip turns every Azerbaijani schwa and every
  Cyrillic character into mojibake, silently. It happened to `lib/i18n.ts` and
  needed `git checkout` to recover. Edit non-ASCII files with the Edit/Write
  tools or a Node script.
- **The Bash tool frequently times out** on `cd`-prefixed compound commands.
  PowerShell works, with the caveat above.
- **`git push` needs Windows OpenSSH**: git's bundled ssh fails to resolve
  github.com. Use
  `$env:GIT_SSH_COMMAND = '"C:\WINDOWS\System32\OpenSSH\ssh.exe"'`.
- **PHP** is at `C:\php84\php.exe`, Composer at `C:\php84\composer.phar`.
  `OPENSSL_CONF` is set at user scope — without it `openssl_pkey_new` silently
  returns `false` and the ES256 tests cannot generate a keypair.
- **Android SDK** at `C:\Android\sdk`, AVD `nata_pixel` created. The emulator
  needs the AEHD hypervisor driver, which requires an elevated run of
  `C:\Android\sdk\extras\google\Android_Emulator_Hypervisor_Driver\silent_install.bat`.
  Not done.
- **iOS Simulator is impossible** on Windows. Physical iPhone via Expo Go, or
  the Android emulator, or `expo start --web`.
- **Disk was down to ~12 GB free**; the Android SDK accounts for 5.4 GB of it.

### Running things

```
npx expo start --lan          # phone, port 8081
npx expo start --web          # browser, works for the courier screen
cd backend && php artisan serve   # API + admin console at /admin
cd backend && php artisan test    # 101 tests
npx tsc --noEmit
```

The admin console needs `DB_PASSWORD` in `backend/.env`, which is deliberately
not committed.

---

## 4. Verification status

| | |
|---|---|
| Backend tests | 101/101 pass |
| Typecheck | clean |
| iOS bundle | compiles, all changes confirmed present in output |
| Manual click-through | **not done** — no test accounts exist yet |

Nothing in the app has been exercised by hand. Creating customer, courier and
admin accounts and walking the flows is the obvious next step, and needs the
migrations above to be run first or the courier and gift-box paths will fail.
