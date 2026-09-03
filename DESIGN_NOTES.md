# Design notes — rebuilt from the 1.0.2 screen recording

The app's original source was lost; its App Store build compiled the JS to
Hermes bytecode with no source maps, so nothing readable could be extracted
from it. What made an accurate rebuild possible instead was a 66-second screen
recording of the shipped app, plus two Figma stills.

Everything in `theme/tokens.ts`, `lib/i18n.ts` and `lib/catalog.ts` is
transcribed from frames of that recording rather than invented.

## Palette (sampled from the video)

| Token | Value | Where it appears |
| --- | --- | --- |
| `heroFrom` → `heroTo` | `#3184EC` → `#1A6AD4` | Home hero gradient |
| `primary` | `#1E77E5` | Steppers, active states, totals |
| `accent` | `#EF4E24` | `+` buttons, "Götürülmə planla", "Sifarişi təsdiqlə" |
| `amber` | `#F2B71E` | "Növbəti" |
| `background` | `#FDFCEF` | The signature ivory surface |
| `purpleFrom` → `purpleTo` | `#7C2CB6` → `#67199F` | Hədiyyə Qutusu banner |
| `ink` | `#18202B` | Gift-box hero card |

Each service also carries its own tint through the catalogue — dry cleaning
periwinkle, ironing peach, shoes taupe, bedding cyan, bags pink.

## The coastal palette (entry flow, home and orders)

A second palette was supplied later as a colour sheet and applied to the entry
flow, the home screen and the orders section. It lives in `theme/tokens.ts` as
`brand`, **alongside** the video-sampled `colors` rather than replacing it.

| Token | Value | Sheet name |
| --- | --- | --- |
| `brand.timberwolf` | `#D3D0C8` | Timberwolf |
| `brand.aliceBlue` | `#E9F1F6` | Alice Blue |
| `brand.lightBlue` | `#B2D5E2` | Light Blue |
| `brand.moonstone` | `#44A6B5` | Moonstone |
| `brand.midnight` | `#004554` | Midnight Green |

Everything else in `brand` is a blend of those five with white, or a darkened
step between two of them — no sixth hue was introduced.

**What it covers: the entire customer app.** Landing, auth, home, orders,
the tab bar, `StatusBadge`, the service overview, the whole checkout flow
(`app/checkout/*`, `app/payment/[orderId].tsx`, `PaymentMethodPicker`),
`CartFab`, the order detail and tracking screens, notifications, gifts,
`app/toplu`, the profile tab and every profile sub-screen, and the stack's
own inter-screen background in `app/_layout.tsx`.

There is no seam left on any path a customer can walk.

`app/courier/*` is on it too, so the palette is now app-wide across both
roles. The home screen's bento grid keeps its own local palette version.

Two ambers survive on the courier screen and are load-bearing:

- the **GPS dot**, amber against `success` green — amber is "not sharing
  yet", which is a live state the courier needs to read at a glance
- the **job-offer count badge** — offers are first-to-claim, so a courier who
  misses the badge loses the work to someone else. It has to stand out
  against the palette, not settle into it.

### Identity colours that survive inside the palette

Four things are *not* recoloured, because in each case the colour carries
information the palette cannot:

| Kept | Where | Why |
| --- | --- | --- |
| `serviceTheme` tints | catalogue circles, hero banners, `toplu` green | tells the six services apart |
| Gift-box navy | `app/gifts` hero and reveal backdrop | matched to the rendered artwork; recolouring leaves the image on a visible rectangle of the wrong colour |
| Red | destructive rows, cancelled badges, errors | an outcome, not brand colour |
| Green | `completed` badges, eco tier | same |

`app/profile/personal.tsx` is a fourth kind of exception: it stays
deliberately monochrome — a form on white with no accent competing for the
eye — but its greys now come from `brand` so they do not read as a cold cast
against the teal-tinted chrome around them.

The profile tab and `SettingsScaffold` had each defined an identical
seven-colour palette object. They now share one, in `SettingsScaffold`, so
they cannot drift apart.

### Service overview: what stayed, and why

The chrome moved to `brand` — Alice Blue surface, coastal borders,
`brand.onSoftMuted` for secondary type, moonstone help card. Two things did
not move:

- **The per-service tints in `serviceTheme` are kept.** They are what tells
  the five services apart at a glance in the circle row and the hero banner;
  flattening them to one hue would cost real information. `heroTagline` also
  stays on the neutral grey rather than `brand.onSoftMuted`, because it sits
  on those tints and a teal-cast grey clashes with the pink and peach ones.
- **Both orange controls stay orange.** The `+` on each row and "Götürülmə
  planla" at the bottom. Orange means "this adds to or commits the order"
  across the whole app, and that meaning does not survive being recoloured
  to match the surface behind it.

The free-delivery modal's "Sifarişi davam etdir" moved *from* blue *to*
orange for the same reason — it commits the basket to checkout, so it was the
odd one out before.

The stepper and count pill took `tone="brand"` (`brand.moonstoneInk`, 5.75:1
against white). Both components keep their old blue as the default, so any
screen not yet restyled is untouched by the change.

### Checkout: the warm buttons stay warm

The same rule carries through checkout. Surfaces, borders, secondary type and
every interactive blue moved to `brand`; the buttons that move the order
forward did not:

| Button | Screen | Colour | Why |
| --- | --- | --- | --- |
| `+` | catalogue | `accent` orange | adds to the order |
| Götürülmə planla | catalogue | `accent` orange | commits the basket |
| Növbəti | schedule | `amber` | steps forward, does not commit |
| Sifarişi təsdiqlə | summary | `accent` orange | places the order |
| Saxla (note sheet) | schedule | `brand` midnight | saves a field, not the order |

Orange means "this adds to or commits the order" and amber means "next step".
Both survive from the 1.0.2 recording and both are load-bearing: recolouring
them to moonstone would make the confirm button indistinguishable from the
tier cards behind it.

### The cart button is a fixture, not a notification

`CartFab` renders on the home screen **only**, and renders there **always** —
including when the basket is empty, where it opens the summary and its own
empty state.

It used to do the opposite: mount on every screen except a hidden list, and
appear only once the basket had something in it. Both halves were wrong.
Appearing on item-add made it a thing that materialised mid-scroll, so its
position was never learnable and the layout shifted under the reader. Showing
it app-wide put a second basket affordance next to screens that already have
one — the catalogue's running-total bar, the summary's confirm button — so
they competed.

The count badge is the one part still conditional: a `0` on a permanent
button reads as a broken counter rather than an empty basket.

**Black type is shared, not recoloured.** `colors.textPrimary` (`#14181F`) and
`colors.ink` still set every heading, price and body line on the restyled
screens. The palette moves surfaces, fills, gradients and accents only.

Three values are darker than the sheet because the sheet's own colours did not
carry type at the sizes used:

- `brand.heroFrom` is `#1E7387`, not Moonstone — the 13px language pills need
  4.5:1 against white, and Moonstone gives 2.6:1.
- `brand.moonstoneInk` (`#256F7D`) sets the in-progress `StatusBadge`, which
  paints its tint at 10% behind that same tint as type.
- `brand.timberwolfInk` (`#6E6859`) does the same for the pending badge.

The tab bar's raised "+" takes a Midnight Green glyph rather than a white one:
white on Moonstone is 2.85:1, under the 3:1 a graphical object needs.

`completed` and `cancelled` order badges keep green and red. Those two read as
outcomes rather than brand colour, and dropping the red on a cancelled order
would cost real information.

## Screens rebuilt

| Screen | Route | From |
| --- | --- | --- |
| Ana səhifə | `app/(tabs)/index.tsx` | video 00:24 |
| Hədiyyə Qutusu | `app/gifts/index.tsx` | video 00:04–00:22 |
| Xidmət icmalı | `app/service/[serviceId].tsx` | video 00:26–00:34, Figma stills |
| Çatdırılma Vaxtı | `app/checkout/schedule.tsx` | video 00:36–00:54 |
| Sifariş xülasəsi | `app/checkout/summary.tsx` | video 00:56–01:05 |

## Pricing, derived from the video's own arithmetic

The order summary reads Ara cəm ₼37.00 / Çatdırılma haqqı ₼5.00 / Ümumi ₼42.00,
with a red note explaining the ₼5 applies because the basket is under ₼40.
`lib/pricing.ts` reproduces exactly those figures, and the Laravel test suite
asserts them.

## Typeface: switched from Outfit to Plus Jakarta Sans

The original build's font, Outfit, **has no schwa glyph (`ə`/`Ə`) at all** —
Google Fonts returns a subset without it even when the character is requested
explicitly. `ə` appears in almost every Azerbaijani word (Hədiyyə, təmizləmə,
əşya, çatdırılma), so every one of those words was rendering with a
mid-word fallback-font substitution. The `@expo-google-fonts/outfit` package
also ships a latin-only subset besides, so `ş`/`Ş`/`ğ`/`Ğ` were missing too.
The original App Store build shipped the identical 36 KB font files, so this
was pre-existing, not something the rebuild introduced.

Replaced it with **Plus Jakarta Sans**, verified glyph-by-glyph (via fontTools)
against every weight used here (400/500/600/700/800) to cover the full
Azerbaijani alphabet — `ə Ə ş Ş ğ Ğ ı İ ç Ç ö Ö ü Ü` all present. Similar
geometric character to Outfit, so the visual identity carries over; the
difference is every word now renders in one consistent face instead of
silently switching mid-word. `theme/tokens.ts` also gained a small `type`
scale (`display`/`h1`/`h2`/`h3`/`body`/`caption`/`eyebrow`) so headings pick
up an extrabold weight and tightened tracking instead of each screen
reinventing its own heading style.

## Icons

Service and category icons come from **MaterialCommunityIcons**, not Ionicons —
Ionicons has no washing machine, iron, hanger or laundry basket, which is what
the service circles in the designs actually show. `components/AppIcon.tsx`
carries both families behind one prefixed-string type
(`"mci:washing-machine"` / `"ion:chevron-back"`), so data files stay plain
strings while every glyph name is still checked at compile time.

| Service | Glyph |
| --- | --- |
| Quru Təmizləmə | `mci:washing-machine` |
| Ütüləmə | `mci:iron` |
| Ayaqqabı | `mci:shoe-formal` |
| Yataq Dəsti | `mci:bed-king-outline` |
| Çanta | `mci:purse` |
| Toplu | `mci:basket` |

## Toplu — the bulk / count-after-pickup service

A different shape of order from the itemised services: the customer picks
nothing up front.

1. Pay a fixed **₼20 deposit**
2. Choose an address and a pickup slot **within 24 hours**
3. The courier collects, counts the load, and the real total is set

This maps onto columns that were **already in the live schema** —
`deposit_amount`, `counted_total`, `counted_at`, `counted_by` — which is
strong evidence the original app was built around the same flow, even though
none of it appears in the screen recording.

Settlement, in `OrderService::countBulk()`:

- counted **above** the deposit → `payment_status = balance_due`, courier
  collects the difference
- counted **below** the deposit → the difference is credited straight back to
  the customer's wallet, `payment_status = paid`
- counting is guarded against running twice, so a double submission can't
  double-refund

The three-photo gate that guards itemised orders deliberately does **not**
apply here — there is nothing to photograph before the load is collected.

## Order lifecycle, dispatch and tracking

The nine-step collection → laundry → delivery flow is a real state machine:
`App\Support\OrderLifecycle` server-side, `lib/lifecycle.ts` in the app.

`orders.status` only has six values and is baked into the live RLS policies
and the shipped 1.0.2 build, so it could not be widened. The nine states live
in a new `lifecycle_state` column, and every transition derives `status` from
it — the two never drift, and nothing that reads the old column had to change.

| State | Driven by | Legacy `status` |
| --- | --- | --- |
| `order_placed` | customer | pending |
| `assigning_couriers` | admin | pending |
| `courier_assigned` | courier (claim) | pending |
| `courier_en_route_pickup` | courier | collecting |
| `picked_up` | courier | collecting |
| `at_laundry` | admin or courier | cleaning |
| `processing_finished` | admin | cleaning |
| `courier_en_route_delivery` | courier | delivering |
| `delivered` | courier | completed |

Transitions are strictly sequential and gated on the actor's role; courier
steps additionally require being the *assigned* courier. Callers name the
target state rather than saying "advance", so a double-tap fails the check
instead of skipping a step. Every move appends an `order_status_logs` row —
that table is what the customer's timeline renders, so each step shows the
time it actually happened.

Notifications are stored as an i18n key plus vars, not a finished sentence:
the app is Azerbaijani-first with RU/EN, so rendering belongs on the client.
The AZ string is kept as `body` for channels that cannot translate.

### First-to-claim dispatch

An admin broadcasts an order to a pool of couriers (`courier_assignments`).
The first courier to accept wins, and that is decided by the database, not by
application logic: the Laravel path re-reads the order inside the transaction
with `lockForUpdate()`, so concurrent claims serialise — the loser blocks,
then sees `courier_id` already set and gets a 409 the app shows as "Sifariş
artıq götürülüb". The app's direct-to-Postgres path gets the same guarantee
from a conditional `UPDATE ... WHERE courier_id IS NULL`, which matches zero
rows for the loser. Checking before taking the lock would be the race, not the
fix.

### Live tracking, without a paid fleet product

Deliberately **not** Google Fleet Engine: two narrow endpoints and one table.
The courier posts a fix every few seconds while en route
(`useLocationBroadcast`, driven by the order's own state so it starts and
stops itself); the customer polls the newest one. Pings outside the en-route
states are rejected server-side, so a loop that failed to stop cannot keep
writing after delivery. A fix older than the staleness window flips the badge
from "Canlı" to waiting-for-signal, so a frozen marker is never shown as live.

Navigation hands off to Google Maps or the platform's own app rather than
rebuilding turn-by-turn — couriers already have a navigator they trust, and an
in-app route would need a billed directions API.

`react-native-maps` has no web implementation, so `TrackingMap.web.tsx` keeps
the web export (used for previews) building; the phone build gets the real map.

## The ILK20 welcome offer

20% off the first order, applied automatically. The customer never types it —
it is announced on the home screen and the server applies it at order time, so
the app sends no promo code at all. A cancelled attempt does not consume it.
An entered code wins only when it is worth more, so nobody is silently
downgraded. It is seeded as a real `promo_codes` row rather than special-cased
in application code, so it shares the normal redemption bookkeeping.

## Admin is on the website, not in the app

The app ships customer and courier roles only. Facility work — the incoming
order feed, dispatch, and the two facility toggles — suits a desk, and putting
those controls in every install would widen the blast radius for no benefit.
The API still exposes the admin endpoints (`POST /orders/{order}/broadcast`
and the admin-only transitions); only the client differs.

## Still unverified

- ~~**`service_prices` columns.**~~ **Resolved 2026-09-03.** The table was read
  in full from the live database: 72 rows, `item_id / service_id / name /
  price / active / updated_at`. `lib/catalog.ts` and
  `backend/config/catalog.php` are now generated from it (71 sellable items —
  `bulk-deposit` is the 72nd and has no catalogue entry, since toplu carries no
  line items), and no price is guessed any more.

  Worth remembering how this was found. The reconstructed catalogue used
  invented ids (`tshirt`, `suit_2pc`) and a comment in `lib/catalog.ts`
  asserted they "line up with" `service_prices`. **Zero of the 49 did.**
  `enforce_item_price` resolves each line by `item_id` and raises on a miss, so
  every order was created with no items and a ₼0 total — checkout failed at the
  final step and three such orders reached production. A guess recorded as a
  fact is worse than a gap: the gap gets checked.

  The two vocabularies are still separate and both are real: the app's own
  service keys are snake_case (`dry_cleaning`, drives routing and the palette),
  the database's are camelCase (`dryCleaning`, in `service_prices` and in the
  31 existing `order_items` rows). `CatalogService.priceServiceId` bridges
  them; send that to the server, never `serviceId`.
- **Reward tables.** `orders.reward_id` exists in the live schema but no
  rewards table appeared in the dump (which also omitted the confirmed
  `wallet_transactions`, so it was certainly cut short). The Laravel migration
  creates them guarded by `Schema::hasTable`; reconcile before running it
  against production.
- **`is_my_assigned_courier(id)`** — the customer-side mirror of
  `is_assigned_courier_for`; still not pulled.
- **Edge Functions** — never checked; if any exist, their source is real
  recoverable TypeScript.
- **RU/EN copy.** The video only ever shows the Azerbaijani locale, so the
  Russian and English strings in `lib/i18n.ts` are translations, not the
  original wording.
