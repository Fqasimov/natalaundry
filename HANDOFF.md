# Nata Laundry — session handoff

Written 2026-09-27. Read this first, then `CLAUDE.md` (working agreement and
invariants) and `PLAY_SUBMISSION.md` (the Play runbook). This file records
state and history; it does not replace either.

---

## 0. Continuing on another device — read this first

This session ran on a Windows machine (`C:\Users\User`). Paths below that start
there are **that machine's**. Everything committed travels with git; the
following does **not**, and the new device needs each one before the matching
work is possible:

| Missing on a new device | Needed for | How to get it |
|---|---|---|
| `.env` (app) | `expo start`, local builds | Recreate from `.env.example`. The same `EXPO_PUBLIC_*` values are stored on EAS (production environment), so EAS builds work without it |
| `backend/.env` | every `scripts/migration/*.js` DB script, Laravel | Recreate: `DB_HOST` (Frankfurt pooler `aws-0-eu-central-1`, port 5432), `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` |
| `~/.app-store/AuthKey_658G7R82ZW.p8` | `eas submit` to Apple, `asc-state.js` | Copy the file over securely, or create a new App Store Connect API key and update `eas.json` → `submit.production.ios` |
| SSH key `id_ed25519_natalaundry` | `git push` **and** deploying the website to Hostinger | Better: generate a fresh key on the new device and add its public half to GitHub (Settings → SSH keys) **and** Hostinger (hPanel → Advanced → SSH Access). Then remove the old one from both |
| `npm install` | everything | Run in the app repo, and separately in the website repo. `pg` and `sharp` are deliberately **not** dependencies: `npm install pg --no-save` for DB scripts, `npm install sharp --no-save` for `npm run icons` |
| `eas login` | builds, submits, OTA | Log in as `fgasimov_07` |
| The AAB file on the Desktop | nothing further — it is already uploaded to Play | Re-downloadable from EAS if ever needed |

**Getting both codebases:**

```bash
git clone git@github.com:Fqasimov/natalaundry.git
cd natalaundry && git checkout feat/payments-auth-rls-ui     # the app

git clone -b website git@github.com:Fqasimov/natalaundry.git natalaundry-web   # the site
```

The `website` branch has **its own history**, unrelated to the app branches —
clone it into a separate folder as above; do not merge it into app code.

**Nothing is running that needs this machine.** Closed testing, the website,
the database and EAS are all hosted. No background process, server or build is
in flight.

---

## 1. What the project is

| Part | Where | Stack |
|---|---|---|
| Mobile app | `C:\Users\User\Desktop\natalaundry`, branch `feat/payments-auth-rls-ui` | Expo SDK 57, RN 0.86.3, expo-router, Hermes |
| Backend | Supabase Frankfurt `kzfsagccvxjmsbqjdpnb` (Postgres + RLS + Auth) | Laravel in `backend/` serves the admin console only |
| Website | `C:\Users\User\Desktop\natalaundry-web`, pushed as branch **`website`** of `Fqasimov/natalaundry` | Vue 3 + Vite, static |
| Hosting | Hostinger, docroot `~/domains/natalaundry.az/public_html` | SSH `-p 65002 u941110553@147.93.54.248`, key `~/.ssh/id_ed25519_natalaundry` |

Identifiers: bundle/package `az.natalaundry.app` · ASC app id `6793012757` ·
Apple team `LJ6BQ556G4` · EAS project `@fgasimov_07/nata-laundry` ·
Play upload key SHA-1 `59:5B:7A:37:9B:18:1C:AB:CE:22:4E:77:CA:22:C7:B5:A6:A8:A7:CA`
(EAS keystore `uhE7qtk8Yo`).

Releases: `runtimeVersion` uses the **fingerprint** policy, so JS-only changes
can ship by `eas update`; anything touching native config needs a store build.

---

## 2. Current state — where things stand

### Google Play (Android) — **closed testing live, clock running**

- Developer account is **personal** → production is gated behind **12 testers
  opted in for 14 continuous days on a CLOSED track**.
- Build **1.1.1 (versionCode 12)** from `99aa8b0` rolled out to the closed
  track on 2026-09-26. Local copy: `Desktop\nata-laundry-1.1.1-12.aab`.
- 12 testers recruited. **Not yet confirmed that all 12 have accepted the
  opt-in** — only accepted testers count.
- Earliest production-access application: **~10 October 2026**, then Google
  reviews it.
- Original rejection (internal testing) was the privacy URL failing DNS —
  **fixed**, see §3.
- Store listing still shows *Temporary app name 'az.natalaundry.app
  (unreviewed)'*.

### iOS (App Store)

- **1.1.0 build 5** is live (`READY_FOR_SALE`). It predates `expo-updates`, so
  it can never receive an OTA.
- **1.1.1 build 8** (`9b99f92`) and **build 9** (`5d45215`) are at Apple, in
  TestFlight. No 1.1.1 App Store version has been created or submitted.
- Build 9 predates the in-app privacy link and the card fix. A new iOS build
  from current HEAD is needed before submitting 1.1.1.
- App Store Connect What's New (en-US only locale) was drafted — see §5.

### Website — **live**

- `https://www.natalaundry.az/` and `https://natalaundry.az/` (301 → www)
- `/privacy` and `/terms` → 200; `/privacy.html`, `/terms.html` → 301
- TLS SAN covers both `natalaundry.az` and `www.natalaundry.az`
- Backup of the old site: `~/backups/public_html-20260920-181411.tar.gz`
  (outside the docroot, so not web-reachable)

---

## 3. What was done in this session

### App

| Commit | Change |
|---|---|
| `9b99f92` | Version bumped to **1.1.1**. Builds 6 and 7 had been silently rejected by Apple (ITMS 90062/90186) because the 1.1.0 train closed on approval |
| `5d45215` | **Account deletion** — `app/profile/delete-account.tsx`, `lib/account.ts`, `supabase/account-deletion.sql`, row in the profile screen, AZ/RU/EN strings |
| `d51b67e` | `scripts/migration/apply-account-deletion.js` |
| `cd970e8` | Revoked `anon`'s EXECUTE on `delete_my_account()` (Supabase default privileges had granted it) |
| `cc1ef0a` | Privacy policy linked in-app (Profile → Kömək və dəstək) |
| `e20814e` | Removed unused `READ_PHONE_STATE` permission |
| `99aa8b0` | **Card payment hidden** (`CARD_ENABLED = false` in `lib/payments.ts`); checkout defaults to cash |
| `83eefa8`, `5586905`, `63fe8b1` | `PLAY_SUBMISSION.md` written and reordered |

Also committed earlier: `scripts/migration/asc-state.js` (asks Apple directly
what builds exist) and `scripts/migration/apply-referrals-and-bonus.js`.

### Production database (applied and verified)

- `supabase/referrals.sql` and `supabase/wallet-topup-bonus.sql`
- `supabase/account-deletion.sql`:
  - `profiles.deleted_at` added
  - FK `profiles_id_fkey` → `auth.users` **dropped** (so a profile survives as
    an anonymous tombstone and orders/payments keep a valid FK)
  - `delete_my_account()` SECURITY DEFINER, no arguments, EXECUTE only for
    `authenticated`
  - Refuses while an order is in flight, and for staff (non-`user`) roles
  - Verified row counts unchanged: 15 profiles / 15 auth users / 18 orders

### Website

- Source was lost with the old machine; the deployed Next.js build was still
  live, so copy, Terms and Privacy were **recovered verbatim** from it.
- Rebuilt in Vue 3 (`b57d0c7` … `95341cf` on branch `website`): AZ/RU/EN,
  SVG logo, animated loader (white drop on blue field), scroll reveals,
  privacy page with an **account-deletion section** (Google's web route).
- Deployed over SSH. `.htaccess` handles SPA routing, HTTPS, apex → www, and
  the old `.html` URLs.
- Higgsfield: 4 credits spent on `veo3_1_lite`; the clip
  (`public/loader.mp4`) is **not used** — it rendered on black and ghosted
  over the mark. ~1.88 credits remain.

### DNS

- Apex `natalaundry.az` had a broken **ALIAS** record returning no address
  (Chrome showed NXDOMAIN). User deleted it and added **A `@` →
  147.93.54.248**. Verified at both authoritative NS, 8.8.8.8 and 1.1.1.1.
- `www` is a CNAME to `www.natalaundry.az.cdn.hstgr.net` (Hostinger CDN).

---

## 4. What still has to be done

### Blocking Play production (in order)

1. **Confirm all 12 testers have accepted** the opt-in and installed. Recruit
   2–3 spares: dropping below 12 can restart the fortnight.
2. **App content** in Play Console:
   - Privacy policy → `https://www.natalaundry.az/privacy`
   - **App access** — demo credentials are required (the app is fully behind
     a login). Use an **e-mail/password** account (Google sign-in is broken)
     with an address and one completed order.
   - Data safety — full table in `PLAY_SUBMISSION.md`
   - Content rating, target audience 18+, ads (none), government apps (no),
     financial features, account deletion (in-app + the privacy URL)
3. **Store listing** — real app name, short/full description, ≥2 phone
   screenshots, 512×512 icon (`assets/images/play-store-icon.png`), and a
   **1024×500 feature graphic, which does not exist yet**.
4. After 14 days: **Apply for production access** (form asks how testers were
   recruited, what feedback came back, what changed). Then production release,
   staged rollout.

### Real bugs, deferred but not optional

- **Card payment.** `payments` Edge Function is **not deployed** (probe:
  `404 NOT_FOUND`); `payments-callback` unreachable. It also defaults to
  Kapital's **test** host `txpgtst.kapitalbank.az`. To restore: deploy both
  functions with `KAPITAL_USERNAME`, `KAPITAL_PASSWORD`, production
  `KAPITAL_BASE_URL` (and `KAPITAL_CALLBACK_URL`) as secrets, confirm with
  `node scripts/migration/probe-edge-functions.js`, set `CARD_ENABLED = true`,
  rebuild. Card was throwing for **live iOS users** until hidden.
- **Google sign-in broken on iOS and Android.** Never diagnosed. First check:
  Supabase → Authentication → URL Configuration → redirect allow-list must
  include `natalaundry://auth-callback` (code: `lib/auth-context.tsx`).
- **Resend / signup OTP e-mails not arriving.** DNS and Resend reachable; check
  Supabase → Logs → Auth for an SMTP error. Suspect the Resend key was rotated
  without updating Supabase's SMTP password.

### iOS

- Build a new iOS binary from current HEAD (still 1.1.1 — the train is open
  because 1.1.1 was never submitted for review).
- In App Store Connect: create version **1.1.1**, attach the new build, paste
  What's New, submit.
- Consider an `eas update` afterwards: build 8+ binaries share fingerprint
  `dc7f056f…`, but the permission change moved the fingerprint, so check with
  `npx expo-updates fingerprint:generate --platform ios` before relying on OTA.

### Website

- Legal text still names **Stripe** (the app uses Kapital) and a **CleanPass**
  subscription (the app calls it Nata Plus). Carried over, not rewritten —
  owner's decision.
- `src/site.js` → `playLive: false`. Flip to `true` when the Play listing is
  public, so Android visitors get the Play link.
- Stale Next.js files sit loose in `~` on the host (not the docroot). Harmless;
  can be deleted.

### Security / housekeeping

- **Rotate**: Resend key, the GitHub PAT pasted in chat, the personal account
  password pasted in chat. Treat all as public.
- **Delete the retired Seoul Supabase project** (`dzplzvogobqmwaaimkef`); its
  password was also exposed.
- The SSH key `id_ed25519_natalaundry` is shared by GitHub **and** Hostinger —
  revoking it in one place cuts the other. Consider a separate Hostinger key.
- Order #64 stranded in `processing_finished` with no courier; test courier
  profile is named "info" with no phone.
- Admin board latency: diagnosed (several ~350 ms round trips per action), not
  fixed.

---

## 5. Useful artefacts

**Play release notes** (≤500 chars, must be wrapped in the listing's language
tag, e.g. `<az-AZ>…</az-AZ>` — bare text fails with "text outside language
tags"):

```
<az-AZ>
Dostunuzu dəvət edin — hər ikiniz 5 ₼ qazanın. Qeydiyyatda dəvət kodu daxil etsəniz, 5 ₼ dərhal hesabınıza düşür; dostunuzun bonusu ilk sifarişiniz ödənildikdən sonra verilir.

Balansı artırın, daha çox qazanın: 100–200 ₼ üçün 5%, 200 ₼-dən yuxarı üçün 10% bonus.

Xidmət seçimi daha aydındır: hər kateqoriyanın adı görünür və seçilmiş xidmət işarələnir.

Əşyanızı tapa bilmirsiniz? Həmin bölmə artıq WhatsApp-ı açır.

Hesabınızı istənilən vaxt Profil bölməsindən silə bilərsiniz.
</az-AZ>
```

**Scripts worth knowing**

| Script | Use |
|---|---|
| `scripts/migration/asc-state.js` | What builds/versions Apple actually has. `eas submit` "success" is not proof |
| `scripts/migration/probe-edge-functions.js` | Whether Edge Functions are deployed |
| `scripts/migration/inspect-account-deletion.js` | FKs and PII columns around a user |
| `scripts/migration/apply-account-deletion.js` | Applies and verifies the deletion migration (idempotent) |

---

## 6. Carried over from the 2026-08-25 handoff

This file replaced an earlier handoff. Most of that one is superseded — its
pending migrations were applied on 2026-08-27, the SDK is 57 not 54, and its
"no test accounts exist" is no longer true. The full text is in history:
`git show 0e33339:HANDOFF.md`. What is still true:

**Still open**
- **Rotate the Supabase database password and JWT secret** — both were pasted
  into a chat transcript. The JWT rotation is harmless: the project signs with
  ES256 and Laravel verifies against the public JWKS.
- **`is_my_assigned_courier(id)` source was never recovered.** It backs a live
  `profiles` policy and is `SECURITY DEFINER` in `public`, so anyone can call
  it. Confirm it checks `auth.uid()` internally:
  `select pg_get_functiondef(oid) from pg_proc where proname = 'is_my_assigned_courier';`
- **Apple Pay / Google Pay** are built but off. Kapital's documented API only
  reports `"paymentMethods": ["Card"]`. Ask Kapital whether wallets are enabled
  on the merchant terminal before turning them on — this is moot until card
  itself works again (§4).

**Environment**
- `git push` may need Windows OpenSSH if git's bundled ssh cannot resolve
  github.com: `$env:GIT_SSH_COMMAND = '"C:\WINDOWS\System32\OpenSSH\ssh.exe"'`.
- `OPENSSL_CONF` is set at user scope; without it `openssl_pkey_new` returns
  `false` and the ES256 backend tests cannot generate a keypair.
- Android SDK at `C:\Android\sdk`, AVD `nata_pixel`. The emulator needs the
  AEHD driver (elevated `silent_install.bat` under
  `extras\google\Android_Emulator_Hypervisor_Driver`) — never installed.
- No iOS Simulator on Windows; test on a physical iPhone.
- Disk was down to ~12 GB free at the time; the Android SDK is 5.4 GB of it.
- `DB_PASSWORD` lives only in `backend/.env`, deliberately uncommitted.

**Security history worth knowing** (all fixed, detail in `SECURITY.md`):
profile privilege escalation through column grants; client-priced order
inserts; a courier UPDATE policy with a null `WITH CHECK`.

---

## 7. Lessons from this session

- **A tool reporting success is not evidence.** `eas submit` printed success
  for builds Apple had rejected; a SQL file in the repo was never deployed; an
  ALIAS record existed in the panel and answered nothing. Check the far end.
- **Ask for the rejection text before fixing.** Account deletion was built on
  the assumption it caused the Play rejection; the real cause was DNS.
- **PowerShell corrupts UTF-8 and strips inner quotes.** Use Node for any file
  or HTTP body with Azerbaijani/Cyrillic, and pipe remote shell scripts over
  stdin (`Get-Content x.sh -Raw | ssh … "bash -s"`) instead of one-liners.
  The Bash tool hung on every call this session.
- **.NET `ZipFile` writes backslash paths.** `unzip` accepts them with a
  warning — which a `set -e` script treats as failure.
- **Credentials policy held throughout:** no passwords typed or read, no
  secrets printed; SSH by key only; Hostinger password auth was offered and
  declined.
