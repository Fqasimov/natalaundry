# Google Play — the whole path to production

Status 2026-09-25. The app has **never been published on Play**. There was one
internal-testing submission, and it was rejected.

**The rejection is fixed and it was never the app.** It was the privacy policy
URL failing DNS:

> The privacy policy URL you provided is returning a DNS name not found error.
> `https://natalaundry.az/privacy`

Two faults in one URL — the apex had no address record, and extensionless
`/privacy` returned 403. Both closed: the apex resolves, both paths return 200,
`/privacy.html` redirects. Verified from the authoritative nameservers and from
8.8.8.8 and 1.1.1.1.

---

## The one thing that decides the timeline

**The developer account is personal** (confirmed 2026-09-25). Unless it was
created before **13 November 2023** — check once at *Settings → Developer
account → Account details*; if it predates that, skip to Phase 3 — production
is gated behind:

> **12 testers, opted in continuously for 14 days, on a CLOSED track.**

Internal testing does not count, so no clock has started. The 14 days begin
when the twelfth tester opts in, and dropping below 12 can reset it.

**Everything else can be done while that clock runs.** So the order below is
not "easiest first" — it is "what starts the clock first".

---

## Phase 1 — today, to start the clock

1. **Upload the build to a CLOSED track.** Play Console → *Testing → Closed
   testing → Create track* (or use the default *Alpha*) → *Create new release*
   → upload the AAB → release name `1.1.1 (12)` → Save → Review → **Start
   rollout**.

   Some App content answers are demanded before even a closed release will
   save. If so, do Phase 2 first — but do it today, because nothing starts
   until this release is live.

2. **Recruit testers.** *Testers* tab → create an e-mail list or point it at a
   **Google Group** (a group means swapping a tester later needs no new
   release). Testers are identified by **Google account e-mail**; a non-Google
   address silently will not work.

   Recruit **15, not 12** — a dropout below twelve can restart the fortnight.
   Couriers, staff, family, regular customers.

3. **Send the opt-in link.** Each tester opens it, accepts, then installs from
   Play. Watch the count on the *Testers* tab. **The clock starts at twelve.**

4. **Ask them to actually use it.** Google looks at engagement, not just the
   headcount. One real order each during the fortnight is plenty. A WhatsApp
   group is enough to collect what they find — you will need to summarise it
   in Phase 4.

## Phase 2 — App content (blocks the release from saving)

Every item must be green.

- **Privacy policy** → `https://www.natalaundry.az/privacy`
- **App access** — the app is entirely behind a login, so Google **requires**
  working demo credentials. A reviewer who cannot sign in rejects. Create a
  throwaway customer, give it an address and one completed order so the
  screens are not empty, and put the e-mail and password under *All
  functionality is restricted → Add instructions*.
- **Ads** — none.
- **Content rating** — questionnaire. Laundry service, no user content:
  Everyone / PEGI 3.
- **Target audience and content** — 18+, no appeal to children.
- **Data safety** — table below.
- **Government apps** — No.
- **Financial features** — the app takes payment for services. Read it rather
  than clicking through; misdeclaring this is a common rejection.
- **Account deletion** — declare in-app deletion **and** the web URL
  `https://www.natalaundry.az/privacy`.

### Data safety — what to declare

From what the code actually collects.

| Data type | Why | Where |
|---|---|---|
| Name | Account, courier contact | `profiles.name` |
| E-mail | Account, sign-in | `profiles.email` |
| Phone | Courier contacts the customer | `profiles.phone` |
| Physical address | Pickup and delivery | `orders.address` |
| **Precise location** | Courier routing, live tracking map | `courier_locations`, `ACCESS_FINE_LOCATION` |
| Payment info | Paying for orders | `payment_intents` |
| Photos | Documenting pre-existing defects | `CAMERA` |
| Push token | Order status notifications | `profiles.push_token` |

Every row: **encrypted in transit — yes**, **deletion can be requested — yes**.
Precise location gets the most scrutiny; the courier tracking map is the
justification and it is a visible, core feature.

## Phase 3 — Store listing (can run in parallel)

- App name, short description (80), full description (4000)
- **Feature graphic 1024×500** — *does not exist yet*, and blocks the listing
- **Phone screenshots**, minimum 2 — the 6.5″ App Store set works
- **App icon 512×512** — `assets/images/play-store-icon.png` (`npm run icons`)
- Category Lifestyle; contact `info@natalaundry.az`; countries include
  Azerbaijan

## Phase 4 — after the 14 days

1. Play Console offers **Apply for production access**.
2. The form asks how testers were recruited, what feedback came back, and what
   changed as a result. Answer from the WhatsApp group — a few sentences each.
3. Google reviews the application. Days, not hours.
4. On approval: *Production → Create new release* → upload the same AAB (or a
   newer one) → staged rollout at 20% is sensible for a first release.

---

## Deferred work — not blocking, but do not lose it

- **Card payment is switched off.** The `payments` Edge Function is not
  deployed (`404 NOT_FOUND`, probed 2026-09-25), so card checkout threw for
  every customer who chose it — on the live App Store build too. Cash and Nata
  Balance settle through `pay_order` and are unaffected.

  To restore: deploy `payments` and `payments-callback` with
  `KAPITAL_USERNAME`, `KAPITAL_PASSWORD` and a **production**
  `KAPITAL_BASE_URL` as secrets, confirm with
  `node scripts/migration/probe-edge-functions.js`, then set `CARD_ENABLED =
  true` in `lib/payments.ts`. One line, plus a build.

- **Google sign-in is broken on both platforms.** Never diagnosed. Prime
  suspect is the Supabase redirect allow-list missing
  `natalaundry://auth-callback` (Authentication → URL Configuration). The demo
  account for review must therefore be e-mail/password.

- **iOS**: build 9 (1.1.1) is in TestFlight and has never been attached to an
  App Store version. It also predates the card fix.

- Order #64 is stranded in `processing_finished` with no courier; the test
  courier profile is named "info" and has no phone.
