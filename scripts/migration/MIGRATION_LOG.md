# Seoul → Frankfurt, 2026-08-31

Done. `ap-northeast-2` (`dzplzvogobqmwaaimkef`) →
`eu-central-1` (`kzfsagccvxjmsbqjdpnb`).

Measured from Baku, raw TCP handshake to each project's pooler — no Cloudflare
in front, so this is genuine origin distance, and every database round trip
pays it:

| | median |
|---|---|
| Seoul | **324 ms** |
| Frankfurt | **88 ms** |

Roughly 3.7× closer. A request making four sequential queries was paying about
1.3 seconds of pure network; it now pays about 350 ms — and once the API is
deployed in the same region, the API↔DB hop drops to about 1 ms and only the
phone→API leg pays the 88 ms.

---

## How it was done

Not with `psql`: the Frankfurt database password was never in this session, so
the restore ran over the Supabase MCP, which takes SQL strings rather than a
connection. `pg_dump` output is written for psql — `\restrict` meta-commands
and `COPY ... FROM stdin` — so `prepare-for-mcp.php` re-dumps with `--inserts`
and splits the result into executable chunks.

Two things that would have silently corrupted the restore:

**Triggers had to be disabled around the data load.** `orders` carries
`BEFORE INSERT` triggers that force `status` to `pending` and rewrite bulk
amounts; `order_items` has one that overwrites `price` from the catalogue and
another that recomputes the order total. Loading historical rows through them
would have rewritten the very values being restored — every order arriving as
`pending` with recomputed totals, and nothing looking obviously wrong.

**Functions had to be created with `check_function_bodies = false`.**
`pg_dump` emits functions before tables, and the SQL-language ones here
reference `public.orders`. Postgres validates SQL function bodies at creation,
so they fail against an empty schema without it.

## Verified identical

Row counts for all 19 tables, 13 users, 13 identities, 13 bcrypt hashes,
9 confirmed accounts, 32 policies, 19 functions, 10 triggers, RLS on every
table. Order status distribution matches
(`pending 7, collecting 4, completed 2, cleaning 1, delivering 1`), and both
money totals match to the cent: `orders.total` sums to **630.00** and
`order_items` to **423.00** on both sides. Roles: 1 admin, 1 courier, 11 users.

**Nobody has to reset a password.** The bcrypt hashes moved with the accounts
and the UUIDs are unchanged, so every order and profile row still resolves.

## Four things the dump did not carry, each of which had to be added by hand

`pg_dump --schema=public --no-privileges` is a narrower instrument than it
looks.

**1. Grants.** `--no-privileges` strips them, and Supabase gives new tables
generous defaults — so the target came up with `authenticated` holding full
`UPDATE` on `profiles`. That is the privilege escalation this project has
already been bitten by once: RLS chooses *rows*, and the attacker is editing
their own row, so only a column grant fences it off. Replicated exactly from
the source, read out of its catalogues rather than reconstructed.

**2. `SET search_path` on the functions.** Dropped while retyping the bodies,
and caught by Supabase's own linter. On a `SECURITY DEFINER` function that
clause is load-bearing: without it an unqualified `profiles` resolves against
the *caller's* search_path, so a caller who puts their own table earlier on
that path gets the definer's privileges applied to it. All 19 restored.

**3. `EXECUTE` grants — the serious one.** Recreating the functions gave them
Postgres's default `EXECUTE` to `PUBLIC`. The source revokes `PUBLIC` on seven
functions; the restore had granted them to everyone. The consequential one:

```
settle_payment_intent(p_ref text, p_paid boolean)
```

`SECURITY DEFINER`, credits `wallet_transactions`, extends
`subscription_expires_at`, and contains **no auth check at all** — it trusts a
`transaction_ref`, and the live refs are six-digit sequential numbers
(`253396`, `259031`, …). On the source it is executable by neither `anon` nor
`authenticated`. After the restore it was executable by both, which would have
let any caller settle a pending top-up as paid without paying.

Worth recording how this was nearly missed: the first revoke targeted `anon`
and `authenticated` and appeared to succeed while changing nothing, because
both roles inherit the grant from `PUBLIC`. `has_function_privilege` still
returned true. `PUBLIC` is what has to be revoked.

**4. The signup trigger and the storage bucket.** `on_auth_user_created` lives
on `auth.users`, outside a `--schema=public` dump; without it a new signup
creates an account with no profile row. The `order-photos` bucket and its
three policies live in `storage`, likewise outside.

## Left as the source has it

Trigger functions keep `EXECUTE` for `anon` and `authenticated`, which the
linter flags. Postgres may check `EXECUTE` when a trigger fires, and breaking
signup to satisfy a lint mid-migration is a bad trade. Worth revisiting
deliberately, with a test.

## Still to do — needs the project owner

1. **Set `DB_PASSWORD` in `backend/.env`.** Everything else is repointed:
   `DB_HOST`, `DB_USERNAME`, `SUPABASE_URL` in the API, and
   `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the app.
   The password is the one value that has never been in this session.
2. **Point Supabase Auth's SMTP at Resend**, on the new project. Its DNS is
   already verified. The built-in mailer is capped at a handful of messages an
   hour and will fail silently on the first busy afternoon.
3. **Enable leaked-password protection** in Auth settings — the linter flags it
   and it is a checkbox.
4. **Rotate the Seoul database password**, which was pasted into a chat
   transcript, and keep that project read-only for a fortnight rather than
   deleting it.
5. **Deploy the API in `eu-central-1`** and add the missing
   `api.natalaundry.az` DNS record. Until then the app's write paths still
   have nowhere to go — see `INFRASTRUCTURE.md`.
6. **Fix the SPF record.** Unrelated to this migration, still outstanding:
   `v=spf1 include:_spf.google.com include:_spf.mail.hostinger.com ~all`
