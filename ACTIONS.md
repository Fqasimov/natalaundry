# What is left to do, and exactly how to do each of it

Written 2026-08-31, after the Seoul → Frankfurt move landed (`85833c9`).

Everything here needs a human — a password, a DNS panel, a dashboard toggle, or
a pair of eyes on a screen. Nothing in this list is code I could write.

They are ordered by what blocks what. **1 blocks 2 and 7. 7 blocks 8.**
3, 4, 5, 6 are independent and can be done in any order, today.

| # | Action | Blocks | Time |
|---|---|---|---|
| 1 | Set the Frankfurt `DB_PASSWORD` | the whole backend | 2 min |
| 2 | Verify the API talks to Frankfurt | — | 5 min |
| 3 | Point Auth SMTP at Resend | signups at volume | 10 min |
| 4 | Enable leaked-password protection | — | 1 min |
| 5 | Rotate the Seoul password, freeze the project | — | 5 min |
| 6 | Fix the SPF record | outbound mail deliverability | 5 min |
| 7 | Deploy the API in `eu-central-1` | every write path | 2–4 h |
| 8 | Repoint `EXPO_PUBLIC_API_URL` before building | any store release | 2 min |
| 9 | Upload the garment photos | the catalogue looking real | 1 h |
| 10 | Open the PR | — | 2 min |
| 11 | Manual click-through | a store release | 2 h |
| 12 | The deliberate pass on trigger `EXECUTE` grants | — | 1 h |

---

## 1. Set the Frankfurt `DB_PASSWORD`

This is the one value that has never been in my hands, and the only reason the
backend cannot reach the new database. Everything else in `backend/.env` is
already repointed:

```
DB_HOST=aws-1-eu-central-1.pooler.supabase.com
DB_PORT=6543
DB_USERNAME=postgres.kzfsagccvxjmsbqjdpnb
DB_DATABASE=postgres
DB_PASSWORD=          ← empty, deliberately
```

> **It is not the Seoul password, even though it is the same Supabase account.**
> Database passwords are per *project*, not per account — Seoul and Frankfurt are
> separate Postgres instances with separate `postgres` roles. The username shows
> it: `postgres.dzplzvogobqmwaaimkef` versus `postgres.kzfsagccvxjmsbqjdpnb`.
> Same reason the anon key had to be swapped. The only thing the account shares
> is the dashboard login.

**Steps**

1. **First check whether you already have it.** Supabase makes you set or
   generate a database password when you create a project, so it may be in your
   password manager from the day the Frankfurt project was made. If it is, skip
   to step 3 — no reset needed.
2. Only if you do not have it: open
   <https://supabase.com/dashboard/project/kzfsagccvxjmsbqjdpnb/settings/database>
   → **Reset database password**. Generate a strong one and store it — Supabase
   will not show it again.
3. Open `backend/.env` in an editor and put it after `DB_PASSWORD=`.
   No quotes needed unless it contains `#` or spaces; if it does, wrap it in
   double quotes.
4. Save. **Do not commit it** — `backend/.env` is gitignored, and it must stay
   that way.

> **Port 6543 is deliberate.** That is the *transaction* pooler, which is what a
> Laravel request should use. Port 5432 is the *session* pooler — needed for
> `pg_dump`, `psql`, and DDL, but it holds a connection per client and will run
> you out of connections under real traffic.

---

## 2. Verify the API actually talks to Frankfurt

**Steps**

```bash
cd backend && php artisan migrate:status
```

Every migration should read `Ran`. If it does, the credentials work.

Then confirm the data arrived intact through Laravel's own eyes, not just
Postgres's:

```bash
php artisan tinker --execute="echo App\Models\Order::count().' orders, total '.App\Models\Order::sum('total');"
```

Expect **15 orders** summing to **630.00**. If the total is anything else, stop
and tell me — it would mean the trigger-disable during the restore did not hold,
and historical rows were rewritten on the way in.

Then run the suite:

```bash
cd backend && php artisan test
```

112 tests should pass.

**If step 2 fails with `ENOTFOUND` or `could not translate host name`:** that is
not the password. It is the pooler fleet prefix — Supabase has `aws-0-` and
`aws-1-` fleets and the project can sit on either. Try `aws-0-eu-central-1.pooler.supabase.com`.
That exact symptom cost an hour earlier in this project and looked exactly like
a wrong password.

---

## 3. Point Supabase Auth's SMTP at Resend

**Why this is not optional.** Supabase's built-in mailer is rate-limited to a
handful of messages an hour and is explicitly not for production. It does not
error visibly — the signup succeeds and the confirmation email simply never
arrives. On your first busy afternoon you will get support messages, not logs.

Resend is already fully configured for the domain and its DNS is verified.

**Steps**

1. Get an API key: <https://resend.com/api-keys> → **Create API Key**, scope
   **Sending access**, domain `natalaundry.az`. Copy it — shown once.
2. Open <https://supabase.com/dashboard/project/kzfsagccvxjmsbqjdpnb/settings/auth>
3. Scroll to **SMTP Settings** → enable **Enable Custom SMTP**.
4. Fill in:
   | Field | Value |
   |---|---|
   | Sender email | `noreply@natalaundry.az` |
   | Sender name | `Nata Laundry` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | *the API key from step 1* |
5. Save, then **Rate Limits** → raise **emails per hour** from the default (it
   is pinned low while the built-in mailer is in use).
6. Test it: sign up a throwaway address in the app and confirm the mail lands.
   Check <https://resend.com/emails> for the delivery record if it does not.

---

## 4. Enable leaked-password protection

Supabase's own linter flags this, and it is a checkbox. It checks new passwords
against HaveIBeenPwned's breach corpus at signup.

1. <https://supabase.com/dashboard/project/kzfsagccvxjmsbqjdpnb/settings/auth>
2. **Password security** → turn on **Prevent use of leaked passwords**.
3. While you are there, set **Minimum password length** to at least 8.

---

## 5. Rotate the Seoul password, and freeze the project

The old project's database password was pasted into a chat transcript. Treat it
as public.

**Steps**

1. <https://supabase.com/dashboard/project/dzplzvogobqmwaaimkef/settings/database>
   → **Reset database password**. You never need to write the new one down; the
   point is only to invalidate the old one.
2. **Do not delete the project.** Keep it for a fortnight, until roughly
   **14 September 2026**, as your rollback. A migration that verified clean can
   still surface something a fortnight later, and there is no undo on a deleted
   project.
3. Optionally pause it (Settings → General → **Pause project**) to stop it
   accruing usage. Pausing is reversible; deleting is not.
4. After the fortnight, and only if nothing has surfaced: delete it.

---

## 6. Fix the SPF record

Unrelated to the migration, still outstanding, and it is silently costing you
deliverability today.

**The problem.** Your MX records point at Google Workspace, but SPF authorises
only Hostinger. Any mail you send from Google — every reply from a human at
`@natalaundry.az` — fails SPF and lands in spam or gets rejected outright.

**The fix.** In your DNS panel, edit the `TXT` record on the root (`@`) whose
value begins `v=spf1`, and set it to exactly:

```
v=spf1 include:_spf.google.com include:_spf.mail.hostinger.com ~all
```

**Steps**

1. Open your domain's DNS zone editor (wherever `natalaundry.az` is managed).
2. Find the existing `TXT` record at `@` starting `v=spf1`. **Edit it — do not
   add a second one.** Two SPF records is a permanent error: receivers see
   `permerror` and the domain fails, which is worse than the current state.
3. Paste the value above. Save.
4. Wait for TTL, then verify:
   ```bash
   nslookup -type=TXT natalaundry.az
   ```
   Exactly one `v=spf1` line should come back.
5. Confirm end to end at <https://www.mail-tester.com> — send it a mail from
   your Google Workspace address and check SPF passes.

> Resend does not need adding here; it sends from a subdomain with its own SPF,
> already verified.

---

## 7. Deploy the API in `eu-central-1`

**This is the largest remaining item and the one that actually matters.**
The Laravel API is not deployed anywhere. `EXPO_PUBLIC_API_URL` currently points
at `http://192.168.0.107:8000` — a laptop on your home Wi-Fi. Every write path
in the app (place order, pay, courier lifecycle, tracking) works only while that
laptop is on and the phone is on the same network.

Put it in `eu-central-1`, same region as the database. The API↔DB hop then costs
about **1 ms** instead of 88, and only the phone→API leg pays real distance.

**Where.** Any of these are fine; pick on how much ops you want to own:
- **Fly.io** `fra` region — closest to "just push a Dockerfile", scales to zero.
- **Hetzner Cloud** `fsn1`/`nbg1` — cheapest by a wide margin, but you own the
  OS, the TLS certificates, and the updates.
- **Railway/Render** EU region — easiest, priciest.

Do **not** put it on the Hostinger base plan. Shared PHP hosting with no queue
worker and no persistent process will not run the broadcast/tracking paths.

**Steps**

1. Provision the host in an `eu-central-1`-adjacent region (Frankfurt).
2. Set environment variables to match `backend/.env`, with:
   - `APP_ENV=production`, `APP_DEBUG=false`
   - `APP_URL=https://api.natalaundry.az`
   - a fresh `APP_KEY` (`php artisan key:generate --show`)
   - the same Frankfurt DB values from step 1
3. Add the DNS record — **this is currently missing entirely**:
   ```
   A    api    <host IP>    TTL 300
   ```
   (or `CNAME api → <platform hostname>` if the platform gives you one)
4. Issue TLS for `api.natalaundry.az` — Let's Encrypt via the platform, or
   Caddy/certbot if self-managed.
5. Run migrations against production **once**: `php artisan migrate --force`.
   They are already applied to Frankfurt, so expect "Nothing to migrate."
6. Start a queue worker as a supervised process — not `php artisan queue:work`
   in a shell that dies with your SSH session.
7. Verify: `curl https://api.natalaundry.az/api/health` (or any public route)
   returns 200 over HTTPS with a valid certificate.

---

## 8. Repoint `EXPO_PUBLIC_API_URL` before any build

**Do this immediately before building, and check it every time.** A store build
carrying `http://192.168.0.107:8000` is a dead app for every user — and on iOS
it will not even connect, because ATS blocks plain HTTP.

In `.env`:

```
EXPO_PUBLIC_API_URL=https://api.natalaundry.az
```

Then verify it actually got baked in — Expo inlines these at build time, so a
stale cache is a real failure mode:

```bash
npx expo start --clear
```

and confirm a write path (place an order) reaches the deployed API, not the
laptop.

---

## 9. Upload the garment photos

Every photo in the catalogue is stored as a `file://` URI pointing at a path on
the device that uploaded it. On every other device those render as nothing.

**Steps**

1. Gather the real images.
2. Upload each to the `order-photos` Supabase Storage bucket (it exists on
   Frankfurt — I recreated it with its three policies during the migration).
3. Update the catalogue rows to the resulting public URLs
   (`https://kzfsagccvxjmsbqjdpnb.supabase.co/storage/v1/object/public/...`).
4. If you want, hand me the folder of images and I will write the upload +
   row-update script — that part I can do.

---

## 10. Open the PR

<https://github.com/Fqasimov/natalaundry/pull/new/feat/payments-auth-rls-ui>

I cannot open it for you — creating it publishes to GitHub on your behalf.

---

## 11. Manual click-through

**112 automated tests pass and no human has opened a single screen.** The
end-to-end test drives the whole journey over HTTP, which proves the API and the
data are right. It proves nothing about whether a button is reachable, whether
text is legible on the coastal palette, or whether the map renders.

Walk these, on a real device:

- Sign up → confirm email → sign in
- Home → service overview → add to order → cart appears **only on home**
- Checkout → payment → Kapital HPP redirect → return
- Order detail → live tracking → courier marker moves forward, never backwards
- Gift box open, spend prize
- Profile, gifts, toplu
- Courier app: claim → all nine lifecycle states → GPS pings → deliver

---

## 12. The deliberate pass on trigger-function `EXECUTE` grants

Left as-is on purpose during the migration, and worth revisiting when nothing
else is on fire.

Trigger functions currently keep `EXECUTE` for `anon` and `authenticated`,
matching the source. Supabase's linter flags this. Postgres *may* check `EXECUTE`
when a trigger fires, so revoking blind risks breaking signup — and breaking
signup to satisfy a lint mid-migration was a bad trade.

**Steps**

1. Write a test that signs up a new user and asserts a `profiles` row appears.
2. Revoke `EXECUTE` from `PUBLIC`, `anon`, and `authenticated` on the trigger
   functions — **`PUBLIC` first**; revoking only from `anon`/`authenticated`
   reports success and changes nothing, because both inherit from `PUBLIC`.
3. Run the test. If signup still works, keep it. If not, revert and record why.

---

## What I already did, for reference

Nothing in this list needs redoing:

- Database moved Seoul → Frankfurt, verified row for row (19 tables, 13 users,
  13 bcrypt hashes, 32 policies, 19 functions, 10 triggers, both money totals to
  the cent). Nobody resets a password.
- Three security regressions the restore introduced, found and closed: full
  `UPDATE` on `profiles` for `authenticated`; missing `SET search_path` on all 19
  functions; and `settle_payment_intent` — `SECURITY DEFINER`, credits the
  wallet, no auth check — becoming callable by `anon`.
- Signup trigger and `order-photos` bucket recreated (both live outside a
  `--schema=public` dump).
- Six missing indexes on hot queries, applied.
- The courier-marker backwards-jump fixed, at the query, the model, and the
  column precision.
- App and API `.env` repointed at Frankfurt.

Detail in [`scripts/migration/MIGRATION_LOG.md`](scripts/migration/MIGRATION_LOG.md)
and [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md).
