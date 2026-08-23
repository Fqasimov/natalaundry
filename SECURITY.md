# Security notes

What was found while attacking this app, what was fixed, and what still has to
be done by hand against the live project. Written to be read in order; the
first section is the part that is not yet done.

## Not done yet — needs running against Supabase

`backend/database/policies/rls.sql` is the set of Row Level Security policies
the app now assumes. It has **not** been applied: the build environment cannot
reach `*.supabase.co`, so it has to be reviewed and run from the Supabase SQL
editor. Until it is, the fixes below are only half of the story, because the
app reads and (for notifications) writes Postgres directly.

The single most important line in it:

```sql
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (name, phone, avatar_url, language, birthday, last_active_at)
  ON public.profiles TO authenticated;
```

RLS chooses **rows, not columns**. A policy of the shape "users may update
their own profile" — the obvious one to write, and the one the app's own
profile screen implies — also lets a customer set `role` to `admin` or
`courier`, and set their own `wallet_balance` and `points`, in a single request
against PostgREST. No app change can prevent that; only the column grant can.
Check what is live before assuming it is safe.

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
