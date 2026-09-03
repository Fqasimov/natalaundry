/**
 * Can this account actually sign in?
 *
 * A user inserted straight into auth.users often looks fine in the table and
 * still fails at the login endpoint: Supabase's password grant needs an
 * `auth.identities` row for the email provider, a bcrypt `encrypted_password`,
 * and a confirmed email. A dashboard-created user gets all three; a hand-rolled
 * INSERT usually gets none of them, and the only symptom is "Invalid login
 * credentials" with nothing in any log.
 *
 * No password is read or printed — only whether the fields are shaped right.
 *
 * usage: node scripts/migration/probe-account-health.js <email>
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const email = process.argv[2];
if (!email) {
  console.error("usage: node scripts/migration/probe-account-health.js <email>");
  process.exit(2);
}

const env = {};
for (const line of fs.readFileSync(path.join(__dirname, "..", "..", "backend", ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const client = new Client({
  host: env.DB_HOST, port: 5432, user: env.DB_USERNAME,
  password: env.DB_PASSWORD, database: env.DB_DATABASE,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await client.connect();

  const { rows } = await client.query(
    `select u.id,
            u.email,
            u.aud,
            u.role                              as pg_role,
            u.email_confirmed_at is not null    as email_confirmed,
            u.banned_until is not null          as banned,
            u.deleted_at is not null            as deleted,
            left(coalesce(u.encrypted_password, ''), 4) as pw_prefix,
            length(coalesce(u.encrypted_password, ''))  as pw_length,
            (select count(*) from auth.identities i where i.user_id = u.id) as identities,
            (select count(*) from auth.identities i
              where i.user_id = u.id and i.provider = 'email')              as email_identity,
            p.role as profile_role
       from auth.users u
       left join public.profiles p on p.id = u.id
      where lower(u.email) = lower($1)`, [email]);

  if (!rows.length) {
    console.log(`no account for ${email}`);
    await client.end();
    process.exitCode = 1;
    return;
  }

  const a = rows[0];
  let problems = 0;
  const check = (ok, label, detail) => {
    if (!ok) problems++;
    console.log(`${ok ? "  ok  " : "BAD   "}${label.padEnd(34)}${detail}`);
  };

  console.log(`${a.email}\n`);
  check(a.email_confirmed, "email confirmed", a.email_confirmed ? "yes" : "NO — login refused until confirmed");
  // bcrypt hashes start $2a/$2b/$2y. Anything else is not a usable password.
  check(a.pw_prefix.startsWith("$2"), "password is a bcrypt hash",
    a.pw_length ? `${a.pw_prefix}… (${a.pw_length} chars)` : "EMPTY — no password set");
  check(Number(a.email_identity) === 1, "auth.identities row for email",
    `${a.email_identity} (total identities: ${a.identities})`);
  check(a.aud === "authenticated", "aud", a.aud ?? "(null)");
  check(a.pg_role === "authenticated", "role claim", a.pg_role ?? "(null)");
  check(!a.banned, "not banned", a.banned ? "BANNED" : "no");
  check(!a.deleted, "not deleted", a.deleted ? "DELETED" : "no");
  check(a.profile_role !== null, "profile row exists", a.profile_role ?? "MISSING");

  console.log(`\nprofile role: ${a.profile_role ?? "—"}`);
  console.log(problems
    ? `\n${problems} problem(s) — this account will not sign in as it stands`
    : "\nthe account is shaped correctly and should sign in");
  await client.end();
  process.exitCode = problems ? 1 : 0;
})().catch((e) => { console.error(`FAILED: ${e.message}`); process.exitCode = 1; });
