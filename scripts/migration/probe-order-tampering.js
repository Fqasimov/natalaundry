/**
 * A client can name any column in its INSERT. The triggers are supposed to
 * overwrite the ones that decide money and state. This inserts a deliberately
 * tampered order as `authenticated` and reports what actually survived.
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

// column -> [value the attacker sends, what it must end up as]
const TAMPER = [
  ["status", "'delivered'", "pending"],
  ["lifecycle_state", "'delivered'", "order_placed"],
  ["dispatch_state", "'assigned'", "awaiting_admin"],
  ["payment_status", "'paid'", "pending"],
  ["discount", "999", "0.00"],
  ["delivery_fee", "-50", "0.00"],
  // deposit_amount / counted_total are omitted: `orders_bulk_amounts_check`
  // rejects them outright on a non-bulk order, which is the correct answer and
  // stops the rest of this probe from running.
  ["approved_at", "now()", null],
  ["assigned_at", "now()", null],
  ["delivered_at", "now()", null],
];

(async () => {
  await client.connect();
  const { rows: u } = await client.query(
    `select id from auth.users where email = $1`, ["faiq.farid0604@gmail.com"]);
  const userId = u[0].id;

  const cols = TAMPER.map((t) => t[0]);
  const vals = TAMPER.map((t) => t[1]);

  await client.query("begin");
  let row;
  try {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: "authenticated", aud: "authenticated" })]);
    await client.query("set local role authenticated");
    const { rows } = await client.query(
      `insert into public.orders
         (user_id, subtotal, total, delivery_tier, collection_time, delivery_time,
          address, is_outside_city, item_photos, payment_method, courier_id, ${cols.join(", ")})
       values ($1, 0, 0, 'standard', 'probe', 'probe', 'probe', false, '[]'::jsonb, 'cash', $1, ${vals.join(", ")})
       returning *`, [userId]);
    row = rows[0];
  } catch (e) {
    console.log(`INSERT REFUSED — ${e.message}`);
    await client.query("rollback");
    await client.end();
    return;
  }

  console.log("the tampered INSERT was accepted; checking what survived:\n");
  let bad = 0;
  for (const [col, sent, must] of TAMPER) {
    const got = row[col] === null ? null : String(row[col]);
    const ok = must === null ? got === null : got === must;
    if (!ok) bad++;
    console.log(
      `${ok ? "  ok  " : "BAD   "}${col.padEnd(20)} sent ${String(sent).padEnd(12)} ` +
      `-> ${String(got).padEnd(16)}${ok ? "" : `(expected ${must})`}`
    );
  }
  const selfAssigned = row.courier_id !== null;
  if (selfAssigned) bad++;
  console.log(
    `${selfAssigned ? "BAD   " : "  ok  "}courier_id           sent self         -> ${row.courier_id}`
  );

  console.log(`\n${bad} field(s) a client should not control survived the insert`);
  await client.query("rollback");
  await client.end();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
