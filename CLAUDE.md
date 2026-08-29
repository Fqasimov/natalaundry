# Nata Laundry — working agreement

## Autonomy

**Do not pause and do not ask.** Pick the best solution for the project and
implement it. This covers design decisions, layout, naming, pricing rules,
schema shape, refactors, dependency choices, commits and pushes to the
working branch. Use judgement, state what was decided in the commit message
and the final report, and keep going.

If two options are genuinely close, pick one, ship it, and say in the report
which was chosen and what the alternative was — do not stop to ask first.

The only things still worth surfacing rather than doing silently:

- running migrations against the **production** Supabase database
  (`php artisan migrate --pretend` first; the reward-table reconciliation
  below is still unresolved)
- force-pushing over commits that are not mine
- anything that spends the user's money or touches App Store release state

Everything else: decide and do it.

## Division of labour

**The user tests the app; the agent runs what the user cannot.** Set 2026-08-23.

Spend effort on work that is genuinely out of the user's reach — backend
logic, migrations, service and pricing rules, data shape, race conditions,
schema archaeology, batch edits across many files, long-running commands —
and on the cheap checks that catch whole classes of error at once.

Leave to the user: tapping through screens, checking buttons work, layout and
spacing judgement, "does this feel right", and end-to-end functional passes.
Do not build render harnesses for these.

### What to run before a push

1. `npx tsc --noEmit` — always. Cheap, catches a lot.
2. `cd backend && php artisan test` — whenever backend logic changed.
3. `git status --short` — must be clean of demo artifacts (see the stub note).

### When a render IS still worth it

Only for changes whose correctness cannot be seen any other way, e.g. a new
visual component with no reference, or a bug reported as "it looks wrong" with
no stack trace. The screenshot recipe below stays for those cases. Note the
trade-off being accepted: the render loop is what caught the `{}` notification
inbox, the untranslated services grid and the Cyrillic-in-Times bug — all of
which typechecked clean. Those now surface in the user's own testing instead.

### Tools, MCPs and subagents

Call only what the task needs. Do not spawn subagents unless asked or the work
genuinely parallelises — each starts cold and re-derives context, which
usually costs more than it saves. Do not call an MCP speculatively; preflight
paid ones (`get_cost`) before spending.

Model choice is the user's, via `/model` — the agent cannot downgrade itself
mid-session.

### Screenshot recipe

The app needs an authenticated session and an HTTP origin to render.

```bash
cp lib/supabase.ts /tmp/supabase.bak          # ALWAYS back up first
# write a stub exporting a fake session + chainable no-op query builder
rm -rf dist && npx expo export --platform web
# inject routing shim so expo-router matches "/" not the file path:
sed -i "s#<div id=\"root\"></div>#<div id=\"root\"></div>\n<script>history.replaceState(null,'','/');</script>#" dist/index.html
cd dist && (nohup python3 -m http.server 8734 >/dev/null 2>&1 & echo $!)
timeout 60 npx playwright screenshot http://localhost:8734/ \
  --viewport-size=390,1300 --wait-for-timeout=3000 /tmp/shot.png
cp /tmp/supabase.bak lib/supabase.ts          # RESTORE — never commit the stub
rm -rf dist
```

For click-through flows use Playwright via
`NODE_PATH=/opt/node22/lib/node_modules node -e '...'` with
`executablePath: '/opt/pw-browsers/chromium'` — playwright is not a project
dependency.

**The stub must never be committed.** Check `git status --short` after
restoring; only intended source changes should appear.

## Environment constraints

- This session is a **remote cloud container**. It cannot reach the user's
  `localhost:8081`, their machine, or any local dev server. Code moves
  between us only through GitHub.
- **Higgsfield**: the MCP works once the connector is authorised (the CLI's
  `auth login` cannot — it is browser OAuth on a loopback port). Generation
  succeeds, but the results land on `d8j0ntlcm91z4.cloudfront.net`, which the
  proxy blocks, so generated assets **cannot be downloaded or inspected from
  here** — the user has to save and commit them. Preflight every call with
  `get_cost`: on the free plan `gpt_image_2` is refused entirely, `soul_2` is
  ~0.12 credits, and video runs 3 credits (minimax-fast 512) to 32.5
  (seedance). Drop a rendered still in via `lib/gift-box-asset.ts`.
- The agent proxy **blocks `api.supabase.com` and `*.supabase.co` entirely**
  (403 on CONNECT) and blocks ngrok. Schema pulls and live Supabase calls
  have to be done by the user manually. npm, Packagist and Google Fonts are
  reachable.
- expo-router typed routes go stale and cause phantom `tsc` errors on new
  routes. Regenerate: `rm -rf .expo && npx expo start --web --offline`, wait
  ~4s, kill it. `expo export` does **not** regenerate them. `.expo` must
  stay out of `tsconfig.json`'s `exclude` or typed-route checking silently
  stops working.

## Project shape

Expo SDK 51 / RN 0.74.5 / expo-router, Supabase (Postgres + RLS + Auth), and
a Laravel API over the **same** Postgres. Original source was lost; the app
was rebuilt from a 66-second screen recording of the shipped 1.0.2 build —
see `DESIGN_NOTES.md`, which is the authority on palette, copy and pricing
and should be updated whenever those change.

Key invariants:

- **Fonts**: Plus Jakarta Sans. Outfit was dropped because it has **no schwa
  glyph (`ə`)** — it breaks nearly every Azerbaijani word. Verify any new
  face covers `ə Ə ş Ş ğ Ğ ı İ ç Ç ö Ö ü Ü` before adopting it. Route
  through `font.*` tokens, never hardcoded family strings.
- **Icons**: `components/AppIcon.tsx`, prefixed strings (`"mci:iron"`,
  `"ion:chevron-back"`). Always type icon props as `IconName` — a
  `string` prop with an `as never` cast is what blanked every service icon.
  Ionicons has no laundry-domain glyphs; use MaterialCommunityIcons for them.
- **Pricing** (`lib/pricing.ts` ↔ `backend/config/nata.php`) is derived from
  the video's own arithmetic (₼37 + ₼5 = ₼42) and pinned by tests. The two
  must stay in sync; the server is the authority at order time.
- **Toplu** is a deposit-now / count-after-pickup order — ₼20 deposit, no
  line items, no photo gate, courier sets the real total. It maps onto
  `deposit_amount` / `counted_total` / `counted_at` / `counted_by`, which
  already existed in the live schema. Currently modelled with
  `delivery_fee = 0`.
- **i18n**: AZ is the source of truth (verbatim from the video), RU/EN are
  translations. Every new string needs all three. Never hardcode display
  copy or currency amounts in a screen — parameterise through `t()`.
  Data-shaped copy lives beside its data, not in `lib/i18n.ts`:
  `lib/catalog-i18n.ts` (services, categories, items) and
  `lib/rewards-i18n.ts` (gift rewards, box tiers), each keyed by the same ids
  as its source and falling back to the AZ original. Dates go through
  `lib/dates.ts` — explicit tables, not `Intl`, because Hermes ships a
  trimmed ICU and has no reliable `az`.
  **Check a change in all three languages, not just AZ.** Most i18n bugs
  found so far were invisible in Azerbaijani.
- **Cyrillic**: Plus Jakarta Sans has none. iOS/Android fall back per glyph,
  but CSS does not, so web needs the fallback stack in `theme/tokens.ts`.
  Any family added there needs one too.
- **Catalogue parity**: `lib/catalog.ts` and `backend/config/catalog.php`
  must match exactly; `CatalogParityTest` parses the TS and enforces it.
- **Never check-then-write**, and not only for courier claims: the
  eligibility read and the write that consumes it belong in one transaction
  with `lockForUpdate()`. Gift boxes and order discounts both had this bug.
- **Order lifecycle**: nine states in `orders.lifecycle_state`
  (`App\Support\OrderLifecycle` ↔ `lib/lifecycle.ts`). `orders.status` is
  derived from it on every transition and must never be written directly —
  it only has six values and the live RLS policies depend on them. All
  transitions go through `OrderLifecycleService::transition()`.
- **Claim races**: courier assignment is first-to-claim, decided by the
  database (`lockForUpdate()` server-side, conditional `UPDATE` from the app).
  Never check-then-write.
- **Tracking**: our own `courier_locations` table and polling — deliberately
  not Google Fleet Engine or any per-trip billed API. The GPS loop is driven
  by the order's state, never by a manual toggle.
- **ILK20**: 20% off the first order, applied server-side. The app never
  sends the code; it only announces the offer.
- **Writes go through the API.** Reads use Supabase directly under RLS, but
  anything that decides money or state — order creation, lifecycle
  transitions, claims, the toplu count, location pings, cancellation — goes
  through Laravel via `lib/api.ts`, because RLS chooses rows and has no
  opinion about the values in them. Never add a direct table write for those.
  `EXPO_PUBLIC_API_URL` is required, deliberately with no fallback.
- **RLS: applied for every table that exists.** As of 2026-08-27 all 19
  tables in `public` have `rowsecurity = true`. `rls.sql` is superseded and
  must not be run — it names `profiles.avatar_url`, which does not exist, and
  a GRANT on a missing column aborts the whole transaction. See `SECURITY.md`.

## Still unresolved

- `service_prices` full column list — schema dump was truncated; prices not
  legible in the video are marked `unverified`
- `is_my_assigned_courier(id)` function source never pulled
- Edge Functions never checked — if any exist, that's real recoverable source

## Production database — current state (2026-08-27)

Both migrations have been **applied**. `public` holds 19 tables, all with
RLS enabled, and `rewards` is seeded with the 50-prize pool. ILK20 exists as
a real `promo_codes` row.

Two things worth carrying forward:

- **The pooler host moved.** `aws-0-ap-northeast-2.pooler.supabase.com`
  answers on both ports but rejects this project with
  `ENOTFOUND tenant/user` — it is a routing failure that happens *before*
  authentication, so it looks nothing like a bad password. The project lives
  on `aws-1-*`. If a connection suddenly starts failing that way, check the
  host prefix before touching credentials.
- **`--pretend` under-reports.** In pretend mode Laravel's `select()`
  returns an empty array, so `Schema::hasTable()` reads false and any block
  guarded by it is silently skipped from the preview. The `orders` ALTER
  (`lifecycle_state`, `processing_finished_at`, `promo_code`) never appeared
  in the dry run but did apply for real. Read a `--pretend` as a lower bound,
  not a manifest.
- **Migrate on port 5432, run the app on 6543.** 6543 is the transaction
  pooler; Laravel's schema builder needs the session pooler. Put it back
  afterwards.
- **Laravel creates its own `migrations` table in `public`**, which Supabase
  exposes through PostgREST like any other. It is not named in any policy
  file. RLS was enabled and all grants revoked on it by hand — do the same
  for anything else Laravel adds there.
