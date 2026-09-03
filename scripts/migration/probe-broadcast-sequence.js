/**
 * Replays the broadcast() sequence in ONE transaction, the way Laravel does,
 * because each statement passes in isolation and only fails together.
 *
 * Every step is fenced with a savepoint so the first real error is reported
 * with its own message instead of every later statement saying "transaction is
 * aborted". Always rolled back.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const env = {};
for (const line of fs.readFileSync(path.join(__dirname, "..", "..", "backend", ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
// Port matters here. 5432 is the session pooler, 6543 the transaction pooler —
// and Laravel runs on 6543. Pass a port to compare the two: a failure that
// only appears on 6543 is about pooling, not about the SQL.
const port = Number(process.argv[2]) || 5432;
const client = new Client({
  host: env.DB_HOST, port, user: env.DB_USERNAME,
  password: env.DB_PASSWORD, database: env.DB_DATABASE,
  ssl: { rejectUnauthorized: false },
});
console.log(`connected on port ${port}\n`);

(async () => {
  await client.connect();

  const { rows: o } = await client.query(
    `select id, order_no, user_id from public.orders
      where lifecycle_state = 'order_placed' and courier_id is null
      order by created_at desc limit 1`);
  const order = o[0];
  const { rows: a } = await client.query(
    `select id from public.profiles where role = 'admin' limit 1`);
  const admin = a[0].id;
  const { rows: c } = await client.query(
    `select id from public.courier_details where is_active = true limit 1`);
  if (!c.length) { console.log("no courier on shift — broadcast would refuse before any SQL"); await client.end(); return; }
  const courier = c[0].id;

  console.log(`order #${order.order_no}, admin ${admin.slice(0, 8)}…, courier ${courier.slice(0, 8)}…\n`);

  const steps = [
    ["insert courier_assignments (fires the mirror trigger)",
      `insert into public.courier_assignments (id, order_id, courier_id, offered_at, created_at)
       values (gen_random_uuid(), $1, $2, now(), now())`, [order.id, courier]],
    ["update orders: approved_at",
      `update public.orders set approved_at = now() where id = $1`, [order.id]],
    ["select orders for update",
      `select * from public.orders where id = $1 for update`, [order.id]],
    ["update orders: offered_at + lifecycle_state",
      `update public.orders set offered_at = now(), lifecycle_state = 'assigning_couriers' where id = $1`,
      [order.id]],
    // A trivial statement straight after the update: if THIS is the one that
    // reports "transaction is aborted", the update failed while claiming to
    // succeed, which is what Laravel sees.
    ["sanity: select 1 after the update", `select 1`, []],
    ["insert order_status_logs",
      `insert into public.order_status_logs (id, order_id, from_state, to_state, actor_id, actor_role, created_at)
       values (gen_random_uuid(), $1, 'order_placed', 'assigning_couriers', $2, 'admin', now())`,
      [order.id, admin]],
    ["insert notifications",
      `insert into public.notifications (id, user_id, title, body, read, payload, created_at)
       values (gen_random_uuid(), $1, 'Nata Laundry', 'test', false, '{}'::jsonb, now())`,
      [order.user_id]],
  ];

  await client.query("begin");
  for (const [label, sql, params] of steps) {
    await client.query("savepoint step");
    try {
      await client.query(sql, params);
      await client.query("release savepoint step");
      console.log(`  ok  ${label}`);
    } catch (e) {
      await client.query("rollback to savepoint step");
      console.log(`BAD   ${label}`);
      console.log(`      ${e.message}`);
      if (e.detail) console.log(`      detail : ${e.detail}`);
      if (e.where) console.log(`      where  : ${e.where}`);
      console.log(`      code   : ${e.code}`);
    }
  }
  await client.query("rollback");
  console.log("\n(rolled back)");
  await client.end();
})().catch((e) => { console.error(`FAILED: ${e.message}`); process.exitCode = 1; });
