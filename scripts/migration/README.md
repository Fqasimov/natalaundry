# Moving the Supabase project between regions

Tooling for the Seoul → Frankfurt move described in `INFRASTRUCTURE.md`.
Nothing here is specific to that pair of projects — it reads connection
details from environment files, so it works for any source and target.

## Never commit a dump

`auth.sql` contains **bcrypt password hashes and live refresh tokens** for
every user. `dump/` is gitignored; keep it that way. If you need to move a
dump between machines, use something private — not a repository, not a chat,
not a shared drive that syncs to anywhere you have not thought about.

Regenerating a dump takes about two minutes. Moving one around is rarely worth
the risk.

## Prerequisites

`pg_dump` and `psql`, at a version **at least** as new as the server
(PostgreSQL 17.6 at the time of writing). An older `pg_dump` refuses to run
against a newer server.

- macOS: `brew install libpq` then add its `bin` to `PATH`
- Debian/Ubuntu: `apt install postgresql-client-17`
- Windows: the binaries-only zip from
  `https://get.enterprisedb.com/postgresql/` — no need for the full installer,
  which also installs a local server and a service you do not want

Set `PG_BIN` if they are not on `PATH`:

```
export PG_BIN=/opt/homebrew/opt/libpq/bin
```

## Configuration

Two files, neither of which is in the repository.

**Source** — `backend/.env`, already present. `DB_HOST`, `DB_USERNAME`,
`DB_PASSWORD`, `DB_DATABASE`.

**Target** — a file whose path you pass as `TARGET_ENV`. Copy
`new-project.env.example` beside it, fill it in, and keep it outside the repo:

```
cp scripts/migration/new-project.env.example ~/nata-target.env
export TARGET_ENV=~/nata-target.env
```

Use the **session pooler** host (port 5432) for both, not the transaction
pooler. `pg_dump` and `psql` set session-level state that transaction-mode
pooling drops partway through, and a restore that fails halfway with objects
already created is a bad afternoon.

## Running it

```
php scripts/migration/dump.php        # source -> scripts/migration/dump/
php scripts/migration/verify-dump.php # row counts in the dump vs live source
php scripts/migration/restore.php     # dump -> target, then verifies
```

Each step stops on failure and says why. `verify-dump.php` is not optional:
`pg_dump` exits 0 for a dump with a perfect schema and no rows, and you would
discover that on restore day with the old project already deleted.

## Afterwards, by hand

1. Replay the policy files against the target, in this order:
   `hotfix_profiles_grant.sql`, `hotfix_2_order_writes.sql`,
   `hotfix_3_staff_accounts.sql`, `storage_order_photos.sql`.
2. Then `perf_indexes.sql`, **one statement at a time** — `CREATE INDEX
   CONCURRENTLY` cannot run inside a transaction, and the Supabase SQL editor
   wraps a multi-statement script in one. Confirm none built invalid:
   `select indexrelid::regclass from pg_index where not indisvalid;`
3. Re-run `rls_audit.sql`. Every table must report `rowsecurity = true`, and
   query 5 must return zero rows — a dump can carry policies without carrying
   column grants, and the grant is what stops a customer setting their own
   `role`.
4. Point Supabase Auth's SMTP at Resend. The built-in mailer is capped at a
   handful of messages an hour.
5. Repoint `backend/.env` and the app's `EXPO_PUBLIC_SUPABASE_URL` /
   `EXPO_PUBLIC_ANON_KEY`, and rebuild.
6. Leave the old project read-only for a fortnight. Do not delete it until the
   new build has been live long enough that nobody is still on the old one.

## What the scripts will not do

They do not create the target project, set its password, or touch DNS. They
also do not delete anything from the source — the move is a copy, and tearing
the old one down is a separate, deliberate act.
