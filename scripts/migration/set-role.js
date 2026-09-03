/**
 * Grants a role to an existing account.
 *
 * This has to be done here, not in the app: `handle_new_user` hardcodes
 * role 'user', and the column grants on `profiles` deliberately withhold
 * `role` from clients — anyone who could set their own role to 'courier'
 * would immediately be able to read every pending order.
 *
 * usage: node scripts/migration/set-role.js <email> <user|courier|admin> [--apply]
 * Credentials never printed.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const [email, role] = process.argv.slice(2);
const APPLY = process.argv.includes("--apply");
const ROLES = ["user", "courier", "admin"];

if (!email || !ROLES.includes(role)) {
  console.error(`usage: node scripts/migration/set-role.js <email> <${ROLES.join("|")}> [--apply]`);
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
    `select u.id, u.email, u.email_confirmed_at is not null as confirmed, p.role, p.name
       from auth.users u left join public.profiles p on p.id = u.id
      where lower(u.email) = lower($1)`, [email]);

  if (!rows.length) throw new Error(`no account for ${email}`);
  const acct = rows[0];
  console.table([acct]);

  if (!acct.role) throw new Error("no profile row — the account has not confirmed its email yet");
  if (acct.role === role) { console.log(`already ${role}; nothing to do`); await client.end(); return; }

  console.log(`\n${acct.email}: ${acct.role} -> ${role}`);
  if (!APPLY) { console.log("(dry run — pass --apply to write)"); await client.end(); return; }

  await client.query("begin");
  await client.query(`update public.profiles set role = $2 where id = $1`, [acct.id, role]);

  // The courier dashboard expects a detail row; the app can create its own
  // (there is a policy for it) but only once it can already sign in as one.
  if (role === "courier") {
    const r = await client.query(
      `insert into public.courier_details (id, is_active) values ($1, true)
       on conflict (id) do nothing`, [acct.id]);
    if (r.rowCount) console.log("created courier_details row");
  }
  await client.query("commit");

  const { rows: after } = await client.query(
    `select email, role from public.profiles where id = $1`, [acct.id]);
  console.log("now:");
  console.table(after);
  await client.end();
})().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
