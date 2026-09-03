/**
 * Proves the second layer on its own.
 *
 * probe-order-tampering.js now stops at the column grants, which means it can
 * no longer tell us whether force_order_pending would also have caught the
 * tampering. This runs the same insert *without* dropping to the
 * `authenticated` role — so every grant is held and only the trigger is in the
 * way — while still presenting a non-admin customer's JWT claims.
 *
 * It also checks a toplu (bulk) order still inserts after the grant change.
 *
 * Always rolled back. Credentials never printed.
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

const MUST_BE = {
  lifecycle_state: "order_placed",
  dispatch_state: "awaiting_admin",
  status: "pending",
  payment_status: "pending",
  courier_id: null,
  approved_at: null,
  assigned_at: null,
  delivered_at: null,
  collected_at: null,
  offered_at: null,
};

let fail = 0;

(async () => {
  await client.connect();
  const { rows: u } = await client.query(
    `select id from auth.users where email = $1`, ["faiq.farid0604@gmail.com"]);
  const userId = u[0].id;
  const claims = JSON.stringify({ sub: userId, role: "authenticated", aud: "authenticated" });

  console.log("=== layer 1 alone: grants held, only the trigger in the way ===\n");
  await client.query("begin");
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
  const { rows } = await client.query(
    `insert into public.orders
       (user_id, subtotal, total, delivery_tier, collection_time, delivery_time,
        address, is_outside_city, item_photos, payment_method,
        status, lifecycle_state, dispatch_state, courier_id,
        payment_status, approved_at, assigned_at, delivered_at, collected_at, offered_at)
     values ($1, 0, 0, 'standard', 'probe', 'probe', 'probe', false, '[]'::jsonb, 'cash',
        'delivered', 'delivered', 'assigned', $1,
        'paid', now(), now(), now(), now(), now())
     returning *`, [userId]);
  const row = rows[0];
  for (const [col, must] of Object.entries(MUST_BE)) {
    const got = row[col] === null ? null : String(row[col]);
    const ok = must === null ? got === null : got === must;
    if (!ok) fail++;
    console.log(`${ok ? "  ok  " : "BAD   "}${col.padEnd(20)} -> ${String(got)}`);
  }
  await client.query("rollback");

  console.log("\n=== a toplu order still inserts after the grant change ===\n");
  await client.query("begin");
  try {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    await client.query("set local role authenticated");
    const { rows: t } = await client.query(
      `insert into public.orders
         (user_id, service_type, subtotal, total, collection_time, delivery_time,
          address, address_lat, address_lng, notes, is_outside_city)
       values ($1, 'bulk', 0, 0, 'probe', 'probe', 'probe', 40.4, 49.8, null, false)
       returning service_type, deposit_amount::float8 deposit, total::float8 total, lifecycle_state`,
      [userId]);
    console.log(`  ok   ${JSON.stringify(t[0])}`);
    if (Number(t[0].total) !== 20) { fail++; console.log("BAD   deposit was not forced to 20"); }
  } catch (e) {
    fail++;
    console.log(`BAD   toplu insert refused — ${e.message}`);
  }
  await client.query("rollback");

  console.log(`\n${fail ? `${fail} problem(s)` : "both layers hold"}`);
  await client.end();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
