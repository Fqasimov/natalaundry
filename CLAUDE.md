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

## Verification bar before any push

A change is not done until it has been **rendered and looked at**, not just
typechecked. Several bugs in this project (blank MaterialCommunityIcons,
the dropped Toplu card) compiled cleanly and were only visible in a render.

1. `npx tsc --noEmit` — must be clean
2. Web export + screenshot the affected screen (recipe below)
3. `cd backend && php artisan test` when backend logic changed
4. Confirm `git status` is clean of demo artifacts before committing

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
- **RLS is not applied.** `backend/database/policies/rls.sql` holds the
  policies the app assumes, unrun because Supabase is unreachable here. The
  `profiles` column grant in it is what stops a customer setting their own
  `role` to `admin`. See `SECURITY.md`.

## Still unresolved

- `service_prices` full column list — schema dump was truncated; prices not
  legible in the video are marked `unverified`
- `is_my_assigned_courier(id)` function source never pulled
- Edge Functions never checked — if any exist, that's real recoverable source
- `orders.reward_id` exists live but no rewards table appeared in the dump;
  reconcile before migrating production
