# Security notes

What was found while attacking this app, what was fixed, and what still has to
be done by hand against the live project. Written to be read in order; the
first section is the part that is not yet done.

## Profile privilege escalation — CONFIRMED LIVE, now closed (2026-08-25)

This was not hypothetical. `rls_audit.sql` query 5, run against production,
returned six rows where it must return zero:

```
authenticated | id                      | UPDATE
authenticated | is_subscribed           | UPDATE
authenticated | points                  | UPDATE
authenticated | role                    | UPDATE   <- admin escalation
authenticated | subscription_expires_at | UPDATE
authenticated | wallet_balance          | UPDATE   <- mints money
```

Any signed-in user could set their own `role` to `admin` — opening the
dispatch console — or give themselves an arbitrary `wallet_balance`. The anon
key ships inside the app bundle, so "signed-in user" meant anyone who
downloaded the app and registered.

RLS chooses **rows, not columns**, so no policy could have prevented this: the
attacker is editing their own row. Postgres has no column-level RLS; a table
grant is the only mechanism that fences off columns.

**Closed** by `backend/database/policies/hotfix_profiles_grant.sql`, applied
2026-08-25. Query 5 now returns zero rows. The app is unaffected — it only
ever writes `name` and `phone` to this table, both retained in the grant.

Note that the original `rls.sql` would **not** have fixed this. Its grant names
`profiles.avatar_url`, a column that does not exist (proven when the hotfix's
grant — the same list minus `avatar_url` — applied cleanly). A GRANT naming a
missing column aborts, and the SQL editor runs a script in one transaction, so
`rls.sql` would have rolled back in full, silently leaving the hole open.

## Still not done — the rest of RLS

`backend/database/policies/rls_v2.sql` replaces `rls.sql` and covers the tables
it never mentioned (`payments`, `payment_intents`, `wallet_transactions`,
`user_rewards`, `promo_codes`, `customer_details`, `courier_details`). It has
**not** been applied.

Before running it, `rls_audit.sql` queries 2 and 3 need reconciling:

- **Query 3** — is RLS even enabled per table? A table with `rowsecurity =
  false` is open to anyone holding the anon key no matter what policies exist.
- **Query 2** — which policies already exist? `DROP POLICY IF EXISTS` only
  drops the names `rls_v2.sql` knows, and permissive policies are OR'd, so one
  pre-existing loose policy makes every tighter one decorative.

## Fixed

### Stored XSS in the admin order board

The board built each order card by interpolating values into `innerHTML`.
Customer name, address and courier name all come from rows a customer controls.
Setting `profiles.name` to `<img src=x onerror="…">` put script into the
admin's document as soon as the board loaded — no admin interaction — which is
enough to read the admin session token out of `sessionStorage`.

A Playwright proof of concept carrying payloads in customer name, address and
courier name printed `VULNERABLE — admin token exfiltrated` before the fix and
`FIXED — payload did not execute` after. Cards are now built as DOM nodes with
`textContent`.

### The API accepted the project's own API keys as user tokens

Supabase signs the project's `anon` and `service_role` keys with the same JWT
secret as user access tokens, and the anon key ships inside the mobile bundle.
The middleware checked the signature and the subject, so a key extracted from
the bundle was a valid credential. Expiry was also honoured only when present,
meaning a token minted without `exp` never expired.

Now `exp` is required, `role` and `aud` must both be `authenticated`, `iss`
must be this project's auth server, and the subject must be a uuid (a malformed
one reached Postgres as a cast error rather than a lookup miss). Covered by
`backend/tests/Feature/SupabaseTokenTest.php`.

### The client set its own prices

There was no API client at all. Checkout inserted into `orders` directly,
carrying `subtotal`, `discount`, `delivery_fee` and `total` as computed on the
phone, and naming its own `user_id`. RLS has no opinion about the *values* in a
row it lets you insert, so a modified client could file a full basket for any
total it liked. The same path skipped the automatic first-order discount, which
is applied in `OrderService` — code the app never reached.

Order creation now goes through the API (`lib/api.ts`), sending only item ids,
quantities and logistics. The server prices the basket from its own catalogue
and takes the owner from the access token.

**This entry was wrong for four days.** It was written as if rerouting the app
closed the hole. It did not: the app stopped walking through the door, but the
door stayed open. `rls_audit.sql` query 2, run against production on
2026-08-25, found the original policies still live:

```
orders      | "Users can insert their own orders"      | INSERT
            |   with check (auth.uid() = user_id)
order_items | "Users can insert their own order items" | INSERT
```

Both check only *whose* order it is, never what is in it. Anyone holding the
anon key — which ships inside the app bundle — could POST to PostgREST and
insert an order at `total = 0.01`, bypassing `OrderService` entirely.

Closed 2026-08-25 by `hotfix_2_order_writes.sql`, which drops those policies
and revokes INSERT/UPDATE/DELETE on both tables from `anon` and
`authenticated`. Every order write the app makes already goes through the API,
so nothing in the app depended on them.

The lesson worth keeping: **an app-layer fix is not a fix when the client can
talk to the database directly.** Rerouting the app and closing the policy are
two separate pieces of work, and this file recorded the first as if it were
both.

### Couriers could rewrite any column on a pending order

Found in the same audit:

```
orders | "Couriers can update orders" | UPDATE | WITH CHECK = null
```

When an UPDATE policy omits `WITH CHECK`, Postgres reuses the `USING`
expression as the check. That expression constrained only `courier_id`,
`status` and the caller's role — so a courier updating a pending, unassigned
order could rewrite every other column in the same statement, `total`
included, and the row still satisfied the policy afterwards.

Dropped in `hotfix_2_order_writes.sql`. Courier claims and lifecycle
transitions go through `OrderLifecycleService`, which takes a row lock.

### Customers could delete their own profile

```
profiles | "Users can view and edit their own profiles" | ALL
```

`ALL` includes DELETE, which would orphan that user's orders. Replaced with
explicit SELECT and UPDATE policies in the same hotfix; INSERT and DELETE are
revoked, since rows are created by the auth trigger and accounts are removed
through Supabase Auth.

### RLS: rls.sql superseded by rls_v2.sql

`rls.sql` had a defect that meant it very likely applied *nothing*: it grants
UPDATE on `profiles.avatar_url`, a column that appears nowhere in the app's
types or the schema mirror. A GRANT naming a missing column aborts, and the
SQL Editor runs a script in one transaction, so the whole file would roll
back — leaving the escalation hole it was written to close still open.

`rls_v2.sql` replaces it. Beyond the fix, it closes gaps the original left:

- `payments`, `payment_intents`, `wallet_transactions` — money tables that
  had no policies at all. Insert rights on the ledger would let a customer
  credit their own balance.
- `user_rewards` — `used_at` is what stops a prize being spent twice.
- `promo_codes` — deliberately unreadable; listing it would hand every
  customer every unpublished code.
- `customer_details` / `courier_details` — Stripe ids and live courier
  coordinates.
- `anon` is now revoked everywhere, not only on `service_prices`. The anon key
  ships inside the app bundle, so it is public by construction.
- `service_prices` gets its SELECT policy stated explicitly rather than
  assumed — the original enabled RLS while relying on a policy it never
  created, which would have blanked the catalogue if that policy was missing.

Run `rls_audit.sql` first. Two things cannot be known from this repository:
which columns `profiles` really has, and which policies already exist.
`DROP POLICY IF EXISTS` only drops the names it knows, and permissive policies
are OR'd — so a pre-existing loose policy under another name survives and
makes the tighter ones decorative.

### Payments: what is trusted, and what isn't

Card payments run through Kapital Bank's hosted payment page. Three decisions
there are load-bearing, and all three are covered by `PaymentTest`:

**The redirect is never believed.** The bank returns the customer to
`/api/payments/callback?ID=1234&STATUS=FullyPaid`. That endpoint has to be
public — it is a redirect target for a browser carrying no Supabase token —
so anyone can open it with any query string they like. `STATUS` is therefore
ignored outright: the handler looks up the payment by `ID` and asks the bank
what actually happened via `GET /order/{id}`. The bank's own documentation
independently warns that the redirect's status "can be temporary". Forging
`STATUS=FullyPaid` achieves nothing.

**The amount comes from our own row.** `PaymentService::start()` reads
`orders.total` — the figure the server priced — and never accepts an amount
from the request body. This is the same failure mode as "the client set its
own prices" above, one layer further on: a client that could name its charge
could pay ₼0.01 for a ₼42 order. On top of that, `verify()` compares the
bank's settled amount against what we asked for and refuses to mark an order
paid when they differ, recording `amount_mismatch` and logging it.

**An unknown status is not a paid status.** The bank status is mapped through
an explicit table in `config/kapital.php`; anything unrecognised falls through
to `pending`. A new or misspelled status can leave an order unpaid, which is
recoverable — it must never read as paid, which is not.

Two smaller notes:

- Kapital credentials are *acquirer* credentials and can move money. They live
  only in the backend environment. Nothing about them goes into any
  `EXPO_PUBLIC_*` variable, because everything with that prefix is inlined
  into the JS bundle and shipped to phones.
- The hosted page opens in a system auth session (`expo-web-browser`), not an
  in-app WebView. The customer types card details on that page and should be
  able to see the real address bar and padlock; an embedded WebView also puts
  our own JS on the same page as a card form, which is exactly what we do not
  want.

### The client drove the order lifecycle

- `transitionOrder` named both the source and the target state, so a courier
  could move an order straight to `delivered` without collecting it.
- `advanceOrderStatus` was conditioned on the order id alone — no ownership
  check of any kind.
- `recordTopluCount` wrote `counted_total`, which is the price of a bulk order.
- `pushLocation` inserted position rows naming their own `courier_id`, with
  nothing tying that to the order or requiring the order to be en route.
- `cancelOrder` decided cancellability from the legacy `status` column only.

All of these now go through the endpoints that already implement the state
machine, the actor-role rules and the row-locked claim, with the actor taken
from the token rather than from the request body.

## Looked at, no change needed

- **Claim races.** Settled by `lockForUpdate()` inside a transaction. The
  loser gets a 409, which the courier screen already treats as an ordinary
  outcome rather than an error.
- **Secrets.** Nothing signed or private is committed; `.env` is ignored and
  `.env.example` holds only publishable values, with a note at the top saying
  so.
- **Google Maps key.** Ships in the bundle, which is expected — it is restricted
  by API and referrer in the Cloud Console, and deliberately not enabled for any
  Fleet Engine product.
- **SQL injection.** Every query goes through Eloquent or PostgREST with bound
  parameters; there is no string-built SQL.

### No Content-Security-Policy on the admin console

Fixed at the source is not the same as unexploitable. `AdminConsoleHeaders`
now serves the page with a per-response nonce, `default-src 'none'` and no
`unsafe-inline`, so the next injection of that shape does nothing. Plus
nosniff, same-origin referrers and noindex — the board lists customer names,
addresses and phone numbers.

### No rate limiting

120 requests/minute generally, 20/hour for order creation, 60/minute for
position pings. Keyed by user id rather than IP: the app sits behind mobile
carrier NAT, where an IP limit is one limit shared by a neighbourhood.

## Worth doing next

- The admin console's authenticated path has not been exercised end to end,
  because Supabase is unreachable from the build environment. The CSP is
  asserted in tests, including that every inline block carries its nonce, but
  a real sign-in has not been driven through it.
- Nothing rotates the staff token; it lives for as long as Supabase says. If
  the console grows beyond a handful of people, that is the next thing to
  look at.

---

## Second pass, adversarial (2026-09-01)

A deliberate attempt to break the app from the outside: replay things, race
things, name my own numbers, read other people's rows. Most of it bounced —
the token middleware, the order-scoped lookups and the "server re-prices
everything" rule are all sound. What follows is what did not bounce.

### 1. Double refund on a bulk count — HIGH, fixed

`OrderService::countBulk()` checked `counted_at !== null` **before** opening
its transaction, and never locked the order row. Two counts submitted together
both read `counted_at` as null, both passed the guard, both wrote, and both
credited the customer's wallet with the deposit difference.

That is real money, minted by pressing a button twice on a slow connection.
The guard now runs against a `SELECT ... FOR UPDATE` row inside the same
transaction that writes, so the second attempt sees the first one's effect.

`CLAUDE.md` already said "never check-then-write, and not only for courier
claims" and named gift boxes and order discounts. This one had been missed.

### 2. The same shape in three more places — fixed

- `OrderService::advance()` — two concurrent calls both read `collecting` and
  both stepped forward, skipping a state and stamping its timestamps twice.
- `OrderService::cancel()` — a cancel racing a courier's claim could cancel an
  order that had just been taken, because `isCancellable()` read a copy
  fetched before the claim committed.
- `OrderLifecycleService::transition()` — validated `canTransition()` against
  the instance handed in, then wrote inside a transaction. Two transitions
  therefore both validated against the same stale `from` state, applied twice,
  and wrote two audit rows for one real change. Note that `claim()` in the
  same file always did this correctly; `transition()` did not.

All four now lock and re-read first. `ConcurrencyGuardTest` pins the property
by re-running each operation against a deliberately stale instance — which is
exactly what a second in-flight request holds.

### 3. Unbounded request arrays — MEDIUM, fixed

`items` on order creation and on `orders/quote` had `min:1` and no maximum.
Every line costs a catalogue resolve plus a row insert inside one transaction,
so a single request carrying 100,000 lines pins a database connection and
bloats `order_items`. Capped at 100 lines, 20 photos, and 64 chars per id.

### 4. Amplification through the payment callback — MEDIUM, fixed

`GET /api/payments/callback` is public by necessity — a browser returning from
the bank carries no Supabase token — and every hit makes an **outbound** call
to Kapital to re-read the order. It had no rate limit. Anyone could turn one
cheap unauthenticated request into one bank API call and burn the merchant's
rate budget from a laptop, with a flood of guessed order ids costing them
nothing. Now `throttle:public` (30/min/IP), as are `catalog` and
`payments/methods`. Refunds take a tighter `throttle:money` (10/min).

### 5. CORS was wide open — LOW, fixed

There was no `config/cors.php`, so Laravel's default `allowed_origins => ['*']`
applied to `api/*`. Not immediately exploitable — this API is bearer-token
authenticated, not cookie authenticated, so a cross-origin page has no way to
obtain a token — but it let any site script the API on behalf of anything that
did hold one. Pinned to `APP_URL` plus whatever `CORS_ALLOWED_ORIGINS` names.
The mobile app is unaffected either way: CORS is a browser mechanism.

### 6. No response headers on the API — LOW, fixed

`SecurityHeaders` middleware, API group only (the admin console keeps its own
stricter nonce-based policy). `nosniff`, `X-Frame-Options: DENY`, a
referrer policy that keeps order ids out of third-party logs, HSTS over HTTPS
only, `Cache-Control: no-store` because responses carry addresses and phone
numbers, and a `default-src 'none'` CSP — nothing here returns markup, so
nothing legitimate is lost.

### What held up under attack

Worth recording, so nobody spends the effort twice:

- **Token verification.** Algorithm taken from a fixed allow-list (`none` is
  rejected before any key loads), `exp` required rather than merely honoured,
  and `role`/`aud`/`iss` all pinned — so the anon key that ships in the app
  bundle cannot be replayed as a user token.
- **IDOR.** Every order lookup is scoped by `user_id` or `courier_id` in the
  query itself, not checked afterwards. Photos go through
  `OrderPhotoService::viewableBy()`. Refunds are admin-only. A top-up status
  lookup is scoped the same way, which matters because settlement is keyed off
  the row rather than the requester.
- **Price tampering.** Order creation re-resolves every line against the
  server catalogue and payment reads the amount off the order row. There is no
  request field that can name a charge — including for Nata Balance.
- **Privilege escalation via the API.** `ProfileController::update` validates
  down to name/phone/language, so `role` and `wallet_balance` in the body are
  discarded. Pinned by a test now. Note this is the API path only — the
  PostgREST path is fenced by the column grant in section 1 above, and Nata
  Balance depends on that grant continuing to hold.

### Still needs doing by hand

Two migrations are written but **not applied** — both touch production, so
they are yours to run (`php artisan migrate --pretend` first, and read it as a
lower bound; see `CLAUDE.md` on why `--pretend` under-reports):

- `2026_09_01_000001_create_wallet_topups_table` — new table, additive.
- `2026_09_01_000002_ensure_notification_columns` — adds only missing columns
  to `notifications`, guarded per column, and never drops or rewrites one.

Both need `wallet_topups` fenced the way every other table is: enable RLS and
revoke the `anon`/`authenticated` grants, exactly as was done by hand for
Laravel's own `migrations` table. It holds payment references and amounts, and
PostgREST will expose it the moment it exists.
