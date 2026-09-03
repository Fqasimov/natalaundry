/**
 * Runs the exact UPDATE Laravel's transition() issues, alone, so Postgres
 * reports the real error instead of "transaction is aborted". Rolled back.
 */
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
  const { rows } = await client.query(
    `select id, order_no, lifecycle_state from public.orders
      where lifecycle_state = 'order_placed' and courier_id is null
      order by created_at desc limit 1`);
  if (!rows.length) { console.log("no order at order_placed"); await client.end(); return; }
  const order = rows[0];
  console.log(`order #${order.order_no} (${order.lifecycle_state})\n`);

  const steps = [
    ["update orders: offered_at + lifecycle_state",
      `update public.orders set offered_at = now(), lifecycle_state = 'assigning_couriers' where id = $1`],
    ["insert order_status_logs",
      `insert into public.order_status_logs (id, order_id, from_state, to_state, actor_id, actor_role, created_at)
       values (gen_random_uuid(), $1, 'order_placed', 'assigning_couriers',
               (select id from public.profiles where role = 'admin' limit 1), 'admin', now())`],
  ];

  for (const [label, sql] of steps) {
    await client.query("begin");
    try {
      await client.query(sql, [order.id]);
      console.log(`  ok  ${label}`);
    } catch (e) {
      console.log(`BAD   ${label}`);
      console.log(`      ${e.message}`);
      if (e.detail) console.log(`      detail: ${e.detail}`);
      if (e.where) console.log(`      where : ${e.where}`);
      if (e.code) console.log(`      code  : ${e.code}`);
    }
    await client.query("rollback");
  }

  await client.end();
})().catch((e) => { console.error(`FAILED: ${e.message}`); process.exitCode = 1; });
