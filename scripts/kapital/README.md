# Kapital Bank card payments — test, report, go live

Spec: [Kapital Bank E-commerce API](https://brawny-airport-7ca.notion.site/Kapital-bank-E-commerce-API-Documentation-6dd6a228c40644e3bef034bca7845e3c)

| | Test | Production |
|---|---|---|
| Base URL | `https://txpgtst.kapitalbank.az/api` | `https://e-commerce.kapitalbank.az/api` |
| Credentials | public sandbox: `TerminalSys/kapital` / `kapital123` | issued by the bank after the test report |
| Where they live | defaults in `kapital-test.js` (test host only) | Edge Function secrets — **never** this repo |

## How a payment works here

1. App → `payments` Edge Function → `POST /order` (`Order_SMS`). The amount
   is read from `orders.total` in the database, never from the phone.
2. App opens `{hppUrl}?id={id}&password={password}` — the bank's own page
   takes the card. The app never sees a card number.
3. Bank redirects to `payments-callback` with `?ID=…&STATUS=…`. `STATUS` is
   ignored (the spec itself says it can be temporary); the function asks the
   bank `GET /order/{id}` with our credentials and settles from that answer
   through `settle_bank_order`, which only ever settles once.

## 1. Test payments (now)

```bash
export NODE_USE_ENV_PROXY=1     # only in the cloud sandbox
node scripts/kapital/kapital-test.js create 1.00 purchase
```

It prints a payment link. Open it in a **normal browser** and pay with a test
card. The page cannot be automated from a server — it is behind Cloudflare
bot protection, as a card page should be.

| Test card | PAN | Exp | CVV |
|---|---|---|---|
| Visa | `4169741330151778` | 11/26 | 119 |
| Mastercard | `5239151747183468` | 11/24 | 292 |

**The Visa expires at the end of November 2026 and the Mastercard has already
expired** — expect the Mastercard to decline, and ask the bank for current test
cards if testing runs into December.

Then check and post-process each order:

```bash
node scripts/kapital/kapital-test.js status  <id>          # FullyPaid?
node scripts/kapital/kapital-test.js reverse <id>          # same-day cancel, full
node scripts/kapital/kapital-test.js refund  <id> 1.00     # partial refund
node scripts/kapital/kapital-test.js report                # → REPORT.md
```

Every call is appended to `test-runs.jsonl`; `report` turns that into
`REPORT.md`, which is what goes to the bank.

## 2. Test through the app

The app offers card only when the build sets `EXPO_PUBLIC_CARD_PAYMENTS=true`.
The **`preview`** EAS profile does; `production` does not.

1. Deploy both functions — `payments-callback` without JWT checks, because
   the caller is the bank's redirect, not a signed-in user:

   ```bash
   supabase functions deploy payments
   supabase functions deploy payments-callback --no-verify-jwt
   ```

2. Set the secrets (Dashboard → Edge Functions → Secrets):

   ```
   KAPITAL_BASE_URL=https://txpgtst.kapitalbank.az/api
   KAPITAL_USERNAME=TerminalSys/kapital
   KAPITAL_PASSWORD=kapital123
   KAPITAL_CALLBACK_URL=https://kzfsagccvxjmsbqjdpnb.supabase.co/functions/v1/payments-callback
   ```

3. `eas build --profile preview --platform android`, install, pay an order by
   card, and confirm the order shows as paid.

## 3. Go live

After the bank accepts the report and issues production credentials:

1. Change the three secrets: `KAPITAL_BASE_URL=https://e-commerce.kapitalbank.az/api`
   and the real `KAPITAL_USERNAME` / `KAPITAL_PASSWORD`. No code change.
2. Pay one small real order by card, then refund it with the real credentials:
   `KAPITAL_BASE_URL=… KAPITAL_USERNAME=… KAPITAL_PASSWORD=… node scripts/kapital/kapital-test.js refund <id>`
3. Only then add `"EXPO_PUBLIC_CARD_PAYMENTS": "true"` to the `production`
   profile in `eas.json` and ship a build.

Doing step 3 first ships a card button that takes no real money.

## Known gaps

- `settle_bank_order` exists in production (`scripts/migration/test-settlement.php`
  exercises it) but its source is **not in this repository**. Dump it into
  `supabase/` before anyone edits it.
- Wallet top-up uses the same gateway and switches on with the same flag.
