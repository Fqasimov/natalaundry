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

## Still unverified

- **`service_prices` columns.** Only `service_id` and `item_id` came back from
  the schema dump — it was truncated mid-table. Item prices legible in the
  video are exact; the rest are marked `unverified` in `lib/catalog.ts` and
  commented in `backend/config/catalog.php`.
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
