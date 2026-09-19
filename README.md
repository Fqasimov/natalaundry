# Nata Laundry

Recovery/rebuild of the Nata Laundry Expo app (`az.natalaundry.app`), whose
original source code was lost. The original App Store build's JS was compiled
to Hermes bytecode with no source maps, so it isn't cleanly decompilable —
this project is a **fresh rebuild**, seeded with everything recoverable from
the shipped binary, a 66-second screen recording of it running, and the live
Supabase backend.

`DESIGN_NOTES.md` is the authority on palette, copy and pricing;
`CLAUDE.md` holds the working agreement and the traps worth knowing before
touching anything.

- Bundle ID `az.natalaundry.app`, URL scheme `natalaundry`
- Original iOS permission strings (camera, photo library, location, Face ID, mic)
- Stack: Expo SDK 57 / React Native 0.86 / `expo-router` (file-based routing),
  Reanimated, Moti, `react-native-maps`, `react-native-google-places-autocomplete`,
  `@expo-google-fonts/plus-jakarta-sans`, Supabase JS client, `expo-updates`
- Data model reconstructed from the live project's RLS policies and schema —
  see `types/database.ts` and `SCHEMA_NOTES.md`

**Fonts are not a free choice.** Outfit was dropped because it has no schwa
glyph (`ə`), which breaks nearly every Azerbaijani word. Verify any new face
covers `ə Ə ş Ş ğ Ğ ı İ ç Ç ö Ö ü Ü` first, and note that Plus Jakarta Sans
has no Cyrillic at all — web needs the fallback stack in `theme/tokens.ts`.

## Status

The rebuild is complete and building at 1.1.0. Auth, the order flow, checkout,
payments, the wallet, gift boxes, referrals, notifications, live courier
tracking and the courier's own screens are all implemented — 35 routes under
`app/`. The three languages (AZ source of truth, RU and EN translations) are
in parity.

What is outstanding is deployment, not code: see `ACTIONS.md`. The one live
blocker is that Supabase Auth still uses its built-in mailer, so new users do
not receive a signup code.

## Setup

```bash
cp .env.example .env
npm install
npx expo start
```

`.env.example` documents all five variables and which ones may be left blank.
Note that **`.env` is gitignored and never reaches EAS Build** — a cloud build
reads the same values from EAS environment variables instead, so changing one
here changes it for your machine only:

```bash
node node_modules/eas-cli/bin/run env:list --environment production
```

### Before a push

```bash
npx tsc --noEmit                 # always
cd backend && php artisan test   # whenever backend logic changed
npm run check:icons              # before any build or release
```

`check:icons` decodes the app icons and fails on a near-solid fill, a wrong
size, or an alpha channel on the iOS icon. It exists because the icons were
blank for the whole life of the project and nothing else caught it — a
typecheck, the full backend suite and a green EAS build all pass regardless of
what the picture contains.

## How writes work

Reads go straight to Supabase under RLS. Writes do too — but the database, not
the client, decides the values:

- `BEFORE INSERT` triggers overwrite line prices from the catalogue, recompute
  the total and force the status, so a client asking for `total = 0.01` gets
  back the real figure. See `supabase/direct-writes.sql` and
  `supabase/harden-order-insert.sql`.
- Anything a trigger can't settle is a `SECURITY DEFINER` function that
  re-checks the caller: `claim_order` (two couriers, same millisecond — the
  winner is decided by the database) and `transition_order` (the nine-state
  lifecycle). Being callable is not being authorised.
- Payments go through the `payments` and `payments-callback` Edge Functions.

This replaced an earlier `lib/api.ts` that routed writes through Laravel. That
file no longer exists, and `EXPO_PUBLIC_API_URL` is no longer read by the app.

## Payments

Card payments go through the Kapital Bank e-commerce gateway (hosted payment
page + redirect); cash-on-delivery and wallet balance settle outside the
gateway. Backend configuration lives in `backend/config/kapital.php` and
`backend/.env`.

Apple Pay / Google Pay are built but **disabled** (`KAPITAL_WALLETS_ENABLED=false`).
The documented Kapital API accepts `"paymentMethods": ["Card"]` and exposes no
endpoint that takes a wallet token, so there is nothing for a native Apple Pay
sheet to submit to. Enabling the flag shows the wallet buttons and routes them
through the same hosted page — do that only once Kapital confirms wallet
acceptance is live on the merchant terminal, otherwise the button lands the
customer on a plain card form.

See `SECURITY.md` for why the redirect's `STATUS` parameter is ignored.

## Backend

**Supabase project `kzfsagccvxjmsbqjdpnb`, region `eu-central-1` (Frankfurt).**
Moved from Seoul on 2026-08-31; the pooler handshake from Baku went 324 ms →
88 ms. The old Seoul project `dzplzvogobqmwaaimkef` (`ap-northeast-2`) is
**retired** and read-only — pointing anything at it is a silent no-op, and it
is the single most common way to lose an afternoon here.

The pooler fleet is per project and the two are opposite (`aws-0-eu-central-1`
for Frankfurt, `aws-1-ap-northeast-2` for Seoul). A wrong-fleet host answers on
both ports and then rejects the project with `ENOTFOUND tenant/user`, which
looks nothing like a bad password. Check the prefix before touching
credentials.

`public` holds 19 tables, all with RLS enabled. Laravel runs over the same
Postgres on **port 5432** (not 6543 — PDO's prepared statements fail against
the transaction pooler), and serves the **admin console**; the phone app does
not call it. `supabase/*.sql` holds the policies, triggers and functions;
`scripts/migration/` holds the tooling and `MIGRATION_LOG.md`.

## Releases

JS-only changes ship over the air; native changes ship as a store build.
`runtimeVersion` uses the fingerprint policy, so a bundle needing a native
module is never handed to a binary without it. The binary currently on the
stores (1.0.3) predates `expo-updates` and can never receive an OTA — one more
store build is needed before any of this applies. Full runbook: `OTA.md`.
