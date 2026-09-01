# Deploying the API

The Laravel API has never been deployed. `EXPO_PUBLIC_API_URL` points at
`http://192.168.0.107:8000` — a laptop on a home Wi-Fi network — so every write
path (place order, pay, claim, lifecycle, GPS, gift boxes, toplu count) works
only while that laptop is running and the phone is on the same network.

This is the last thing standing between the project and a store release.

Everything in this directory is ready. What follows needs an account, a card and
a DNS panel, which is why it is written as instructions rather than done.

---

## Before you start

| | |
|---|---|
| Region | **Frankfurt (`fra`)** — same city as the database |
| Runtime | FrankenPHP, PHP 8.3, one process |
| Health check | `GET /up` — Laravel built-in, touches no database |
| Port | 8080 |
| Cost | ~$2–5/month on `shared-cpu-1x` / 512 MB |

**Why not Hostinger.** The base plan is shared PHP hosting: no persistent
process, no control over the document root, no container. It cannot run this.

**Why Fly.** `fly.toml` is written and the Dockerfile already exists. Hetzner is
cheaper but you own the OS and the TLS renewal; Railway and Render are easier but
cost more. If you would rather use one of those, the Dockerfile is portable —
only this file is Fly-specific.

---

## 1. Install and sign in

```bash
iwr https://fly.io/install.ps1 -useb | iex
```

```bash
fly auth login
```

Signing in and adding a card are yours — I cannot do either.

---

## 2. Create the app

From `backend/`:

```bash
fly apps create natalaundry-api
```

If that name is taken, change it in `fly.toml` too — the two must match.

> **Do not run `fly launch`.** It would overwrite `fly.toml` with a generated
> one and offer to provision a Fly Postgres you do not want. The config is
> already written; `fly apps create` plus `fly deploy` is the whole flow.

---

## 3. Set the secrets

Six values. They are encrypted at rest and injected as environment variables at
run time — never baked into the image, never in the repo.

Read each from your local `backend/.env`:

```bash
fly secrets set APP_KEY="<from .env>"
fly secrets set DB_PASSWORD="<the Frankfurt database password>"
fly secrets set SUPABASE_JWT_SECRET="<from .env>"
fly secrets set SUPABASE_SERVICE_ROLE_KEY="<from .env>"
fly secrets set SUPABASE_ANON_KEY="<from .env>"
fly secrets set GOOGLE_MAPS_API_KEY="<from .env>"
fly secrets set KAPITAL_PASSWORD="<from .env>"
```

Everything else — host, port, username, URLs, the pricing constants — is
non-secret and already in `fly.toml`.

**Check nothing is missing before deploying:**

```bash
fly secrets list
```

> `APP_KEY` is not decorative. Without it every encrypted cookie and signed URL
> fails. Use the *existing* one from `.env` — generating a fresh one invalidates
> every session already issued.

---

## 4. Deploy

```bash
fly deploy
```

Then confirm the health endpoint answers over TLS:

```bash
curl -i https://natalaundry-api.fly.dev/up
```

`200` means the container is up. It does **not** mean the database works — `/up`
deliberately touches no database. Test that separately:

```bash
curl -s https://natalaundry-api.fly.dev/api/catalog | head -c 200
```

That route reads Postgres. JSON back means the Frankfurt connection is live.

---

## 5. Point the domain at it

Currently missing entirely — there is no `api.natalaundry.az` record.

```bash
fly certs add api.natalaundry.az
```

Fly prints the records to create. In your DNS panel add:

```
A       api     <the IPv4 Fly prints>     TTL 300
AAAA    api     <the IPv6 Fly prints>     TTL 300
```

Then wait for issuance:

```bash
fly certs show api.natalaundry.az
```

Verify:

```bash
curl -i https://api.natalaundry.az/up
```

---

## 6. Repoint the app

In the **project root** `.env`:

```
EXPO_PUBLIC_API_URL=https://api.natalaundry.az
```

Expo inlines this at build time, so clear the cache or the old LAN address
survives into the bundle:

```bash
npx expo start --clear
```

`lib/api.ts` reads this with **no fallback**, deliberately — so a missing value
fails loudly rather than silently writing unpriced orders.

---

## 7. Before you call it live

**The Kapital credentials are the test ones.**

```
KAPITAL_BASE_URL=https://txpgtst.kapitalbank.az/api
KAPITAL_USERNAME=TerminalSys/kapital
```

`txpgtst` is Kapital's test gateway and that username is their public sandbox
credential. **Real payments will not work until Kapital issues production
credentials.** Set them as secrets, not in `fly.toml`.

Also update the callback, which still points at localhost:

```bash
fly secrets set KAPITAL_CALLBACK_URL="https://api.natalaundry.az/api/payments/callback"
```

The bank calls that URL directly. It must be publicly reachable over HTTPS,
which is precisely what deploying buys you.

---

## Things that will bite

**`config:cache` must never run at build time.** It resolves every `env()` call
and freezes the result into the image, and `.dockerignore` excludes `.env` — so
the build would bake in `127.0.0.1`, port `5432`, database `laravel`, user
`root`, empty password, sslmode `prefer`. All six wrong. Worse, the frozen values
*win* over the platform's: verified by building without `.env` and reading
`bootstrap/cache/config.php` — with `DB_HOST` set in the environment, config
still reported `127.0.0.1`. It surfaces as a connection error against localhost
that looks like bad credentials and is not. The `Dockerfile` caches routes only,
with a comment saying why.

**The pooler fleet prefix.** `FATAL: (ENOTFOUND) tenant/user ... not found` is a
routing failure that happens *before* authentication — not a bad password. The
two projects sit on opposite fleets:

| project | fleet |
|---|---|
| Seoul `dzplzvogobqmwaaimkef` (retired) | `aws-1-ap-northeast-2` |
| Frankfurt `kzfsagccvxjmsbqjdpnb` (live) | **`aws-0-eu-central-1`** |

**Port 6543, not 5432.** 6543 is the transaction pooler, which is what a web
request should use. 5432 is the session pooler — needed for `pg_dump`, `psql`
and DDL, but it holds a connection per client and will exhaust the pool under
traffic.

**Do not run `php artisan migrate` on the deployed app.** The schema is already
applied. Three of Laravel's default stub migrations read `Pending` on purpose —
auth lives in Supabase, and running them would create a second `users` table in
`public` for PostgREST to expose.

**Rotating `APP_KEY` logs everyone out.** Use the existing one.
