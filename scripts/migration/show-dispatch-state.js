/** Where every live order stands, and who it was offered to. Read-only. */
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
    select o.order_no, o.lifecycle_state, o.dispatch_state, o.status,
           o.courier_id is not null as has_courier,
           (select count(*) from public.courier_assignments a where a.order_id = o.id) as assignments,
           (select count(*) from public.order_offers f where f.order_id = o.id) as offers,
           o.created_at
      from public.orders o
     order by o.created_at desc limit 8`);
  console.log("=== orders ===");
  console.table(rows);

  const { rows: recent } = await client.query(`
    select l.created_at, l.from_state, l.to_state, l.actor_role, o.order_no
      from public.order_status_logs l
      join public.orders o on o.id = l.order_id
     order by l.created_at desc limit 8`);
  console.log("=== recent transitions ===");
  console.table(recent);

  const { rows: offers } = await client.query(`
    select o.order_no, p.name as courier, f.response, f.offered_at
      from public.order_offers f
      join public.orders o on o.id = f.order_id
      left join public.profiles p on p.id = f.courier_id
     order by f.offered_at desc limit 8`);
  console.log("=== offers ===");
  console.table(offers);

  await client.end();
})().catch((e) => { console.error(`FAILED: ${e.message}`); process.exitCode = 1; });
