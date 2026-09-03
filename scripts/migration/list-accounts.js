/** Who exists, and what role they hold. Read-only; credentials never printed. */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

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
  const { rows } = await client.query(`
    select u.email,
           u.email_confirmed_at is not null as confirmed,
           coalesce(p.role, '— no profile —') as role,
           u.created_at
      from auth.users u
      left join public.profiles p on p.id = u.id
     order by u.created_at desc
     limit 8`);
  console.table(rows);

  const { rows: staff } = await client.query(
    `select p.role, count(*)::int as n from public.profiles p group by p.role order by 1`);
  console.log("profiles by role:");
  console.table(staff);
  await client.end();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
