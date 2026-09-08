/**
 * Promotes an existing account to courier.
 *
 * Two rows, not one. `profiles.role` is what the app's routing and the RLS
 * policies read, but the shift toggle and the admin console's courier list
 * both read `courier_details` — and a courier with no row there is invisible
 * to dispatch while looking perfectly fine in the profiles table. That split
 * is easy to half-apply by hand, which is why this exists.
 *
 * usage: node scripts/migration/make-courier.js <email>
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const email = process.argv[2];
if (!email) {
  console.error("usage: node scripts/migration/make-courier.js <email>");
  process.exit(1);
}

const env = {};
for (const line of fs.readFileSync(path.join(__dirname, "..", "..", "backend", ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const client = new Client({
  host: env.DB_HOST,
  port: 5432,
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await client.connect();

  const { rows: found } = await client.query(
    `select u.id, p.role from auth.users u
       join public.profiles p on p.id = u.id
      where u.email = $1`,
    [email]
  );
  if (!found.length) throw new Error(`no profile for ${email}`);
  const { id, role } = found[0];

  await client.query("begin");
  try {
    await client.query(`update public.profiles set role = 'courier' where id = $1`, [id]);

    // Starts off shift. Coming online is the courier's own decision — it turns
    // GPS on — so it is not something a role change should switch on for them.
    await client.query(
      `insert into public.courier_details (id, is_active)
       values ($1, false)
       on conflict (id) do nothing`,
      [id]
    );

    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  }

  const { rows: after } = await client.query(
    `select p.role, p.name, p.phone, d.is_active
       from public.profiles p
       left join public.courier_details d on d.id = p.id
      where p.id = $1`,
    [id]
  );
  console.log(`${email}: ${role} -> ${after[0].role}`);
  console.table(after);
})()
  .catch((e) => {
    console.error("FAILED:", e.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
