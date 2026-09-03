/** Read-only census of auth.users vs public.profiles. Credentials never printed. */
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

const q = async (label, sql) => {
  const { rows } = await client.query(sql);
  console.log(`\n=== ${label} ===`);
  console.table(rows);
};

(async () => {
  await client.connect();
  await q("auth.users", `select id, email, created_at, email_confirmed_at is not null as confirmed from auth.users order by created_at desc limit 10`);
  await q("profiles columns", `select column_name from information_schema.columns where table_schema='public' and table_name='profiles' order by ordinal_position`);
  await q("profiles", `select * from public.profiles order by 1 limit 10`);
  await q("orders count", `select count(*) as orders, max(created_at) as newest from public.orders`);
  await client.end();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
