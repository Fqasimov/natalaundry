# Google Play — everything needed to submit, and where we are

Written 2026-09-25. **Play Console's requirements move**, so treat the policy
items here as "expect to be asked this", and read what the Console itself says
on the day. The repository facts are verified against the tree.

## The short version

Nothing in the app code blocks a submission except **account deletion**, which
is a hard Play requirement and does not exist yet. Everything else outstanding
is a Console form, a written document, or an image.

| | Item | State |
|---|---|---|
| 1 | Play Console developer account | **unknown — you** |
| 2 | Closed-testing requirement | **unknown — check first** |
| 3 | Account deletion (in-app + URL) | **missing — blocker** |
| 4 | Privacy policy, published | **missing — blocker** |
| 5 | Data safety form | not started |
| 6 | Store listing text + images | icon only |
| 7 | Demo account for the reviewer | not created |
| 8 | Content rating, audience, ads, financial | not started |
| 9 | Signed AAB | never built |
| 10 | Supabase SMTP / the two SQL files | see ACTIONS.md |

## 1. The account, and the thing that decides your timeline

A Play Console developer account is a one-off fee (US$25 at last check).

**Check this before planning anything else:** Google requires personal
developer accounts registered after late 2023 to run a **closed test with a
minimum number of testers for a minimum number of days** before production
access is granted. When it applies it is weeks, not hours, and no amount of
preparation shortens it. Organisation accounts have been exempt.

Both the numbers and the exemption have changed more than once, so open the
Console and read your own account's status. **If it applies, start the closed
test now and do the rest of this list while it runs** — that is the single
biggest thing you can do for the timeline.

## 2. Account deletion — the one real code blocker

Play requires that an app which lets people create an account also lets them
delete it: **in the app**, and from a **publicly reachable URL** that does not
require installing the app. The URL goes in a Console field.

The app has no deletion path anywhere — no screen, no function, nothing in
`app/profile/`. This needs:

- a row in Profile → Account, with a confirmation step
- a `SECURITY DEFINER` function that deletes or anonymises the profile and its
  dependent rows, since a client cannot be trusted to cascade correctly and
  RLS alone will not let it
- a decision on **orders**: delivery records are usually kept for tax and
  dispute reasons, so the honest answer is normally "the account and personal
  details are deleted, past orders are retained in anonymised form" — which is
  allowed, but **must be stated** on the deletion page and in the policy
- a small public page for the URL

Not started. It is a day's work at most, and it cannot be skipped.

## 3. Privacy policy

Required for every app, and doubly so with camera and location. There is no
policy in this repository and no link in the app.

It has to be a live URL (the natalaundry.az site is fine) and must honestly
cover: account data (name, phone, e-mail), **precise location** and what it is
for, **camera and photos** and what happens to garment photos, order history,
Supabase as the processor and the data being held in **Frankfurt**, the
deletion route from item 2, and a contact address.

It must match the Data safety form exactly. A mismatch between the two is one
of the more common rejection reasons, because it is trivially machine-checked.

## 4. Data safety form

Declare collection of: name, e-mail, phone, **precise location**, photos,
purchase history, and a crash/diagnostics answer. For each: collected or
shared, whether it is required, and why. Say that data is encrypted in transit
and that deletion can be requested.

Two answers worth getting right: location is collected and **not** shared with
third parties (tracking is our own `courier_locations` table, deliberately not
a per-trip billed API), and photos are used only for documenting garment
condition.

## 5. Permissions — fixed 2026-09-25, and worth knowing

The manifest asked for two sensitive permissions the app never uses. Both are
now gone, verified in the resolved config:

- **`READ_PHONE_STATE`** — carried over from the recovered 1.0.2 manifest;
  nothing in the codebase ever read it. Play expects a core-functionality
  justification for it and there was none to give.
- **`RECORD_AUDIO`** — added automatically by **both** `expo-camera` and
  `expo-image-picker`. Turning it off in one was not enough, which is why it
  survived the first fix. `expo-image-picker` now blocks it outright.

What ships: `CAMERA`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`.

**Location is foreground-only** (`requestForegroundPermissionsAsync` +
`watchPositionAsync`, driven by the order's state). There is no
`ACCESS_BACKGROUND_LOCATION`, so Play's background-location declaration form
and demo video **do not apply**. Adding background location later turns a
routine submission into a multi-week review — do not add it casually.

## 6. Store listing

| Asset | Requirement | Have it? |
|---|---|---|
| App icon | 512×512 PNG, no alpha | **yes** — `assets/images/play-store-icon.png` |
| Feature graphic | 1024×500 | **no** |
| Phone screenshots | at least 2 (4–8 is better) | **no** |
| Short description | ≤ 80 characters | no |
| Full description | ≤ 4000 characters | no |

Screenshots have to come off a device or emulator — they are exactly the
"does this look right" judgement that is yours, not mine. Azerbaijani as the
default listing language, with Russian and English added, matches the app.

## 7. App access — do not skip this

The app is login-gated, and **email confirmation is on**. A reviewer who cannot
get past the signup screen rejects the build, and this is one of the most
common causes of a first-submission rejection.

Create a **permanent demo account** with a real confirmed address you control,
put a couple of orders on it so the screens are not empty, and enter the
credentials in Console → App access → "All or some functionality is
restricted". Add a note that the app is in Azerbaijani by default and the
language can be changed in Profile.

If you want the reviewer to see the courier screens, give them a second
account with the courier role and say so.

## 8. The remaining forms

Content rating questionnaire, target audience (18+ — it is a paid service),
ads declaration (**no ads**), news declaration (no), and the financial-features
declaration. That last one is simpler now that the app is **cash-only**: no
card processing ships, so there is nothing to declare and no payments SDK for
Google to ask about. See `lib/payments.ts`.

## 9. The build

```bash
npx eas-cli login
npx eas-cli build --platform android --profile production
```

`eas.json` now has an `android` submit block pointing at
`../../.play-store/service-account.json` — a Google Cloud service account with
the Play Developer API enabled and access granted in Play Console. **It does
not exist yet**; create it, or submit the first AAB by hand through the
Console, which is the usual route for build one.

Run `npm run check:icons` before every build. The icons were blank fills for
the whole life of this project and a green build says nothing about them.

Play App Signing holds the upload key — let EAS generate it and keep the
credentials in the Expo project, not on a laptop.

## 10. Not Play, but still blocking a useful release

- **Supabase SMTP → Resend.** Until signup e-mail works, a new user cannot get
  in — including the reviewer. `ACTIONS.md` §2.1.
- **`supabase/referrals.sql` and `supabase/wallet-topup-bonus.sql`** have never
  been applied. Both fail silently rather than loudly: the referral screen
  reads zeros forever and top-up bonuses quietly do not pay.
- **The admin console** has nowhere to run. Orders can be approved only by hand
  in the SQL editor until it is deployed. It does not block the store, it
  blocks operating the business.
