/** Read-only: the most recent orders and who owns them. Credentials never printed. */
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
    select o.created_at, o.service_type, o.status, o.total, o.payment_method,
           u.email, (select count(*) from public.order_items i where i.order_id = o.id) as items
      from public.orders o
      left join auth.users u on u.id = o.user_id
     order by o.created_at desc limit 8`);
  console.table(rows);
  await client.end();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
