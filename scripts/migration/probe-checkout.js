/**
 * End-to-end proof of the checkout writes with the corrected catalogue ids:
 * creates a real order as a real customer (two requests, exactly like the
 * app), lets the triggers price it, checks the arithmetic, then deletes it.
 *
 * Credentials never printed.
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

// What the app now sends: database item ids, database service_id, price 0.
const LINES = [
  { service_id: "dryCleaning", item_id: "dc-shirt-1", name: "T-Shirt", qty: 2 }, // 7 x 2 = 14
  { service_id: "dryCleaning", item_id: "dc-outer-4", name: "Palto", qty: 1 },   // 25
];
const EXPECTED_SUBTOTAL = 39;
const EXPECTED_FEE = 5;   // under the ₼40 free-delivery threshold
const EXPECTED_TOTAL = 44;

(async () => {
  await client.connect();
  const { rows: u } = await client.query(
    `select id from auth.users where email = $1`, ["faiq.farid0604@gmail.com"]);
  const userId = u[0].id;
  const claims = JSON.stringify({ sub: userId, role: "authenticated", aud: "authenticated" });

  let orderId = null;
  let ok = true;
  try {
    await client.query("begin");
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    await client.query("set local role authenticated");
    const { rows: o } = await client.query(
      `insert into public.orders (user_id, subtotal, total, delivery_tier, collection_time,
         delivery_time, address, is_outside_city, item_photos, payment_method)
       values ($1, 0, 0, 'standard', 'probe', 'probe', 'probe', false, '[]'::jsonb, 'cash')
       returning id`, [userId]);
    orderId = o[0].id;
    await client.query("commit");
    console.log(`orders INSERT       : OK`);

    await client.query("begin");
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    await client.query("set local role authenticated");
    for (const l of LINES) {
      await client.query(
        `insert into public.order_items (order_id, service_id, item_id, item_name, quantity, price)
         values ($1, $2, $3, $4, $5, 0)`,
        [orderId, l.service_id, l.item_id, l.name, l.qty]);
    }
    await client.query("commit");
    console.log(`order_items INSERT  : OK (${LINES.length} lines)`);

    const { rows: priced } = await client.query(
      `select subtotal::float8 subtotal, delivery_fee::float8 fee, discount::float8 disc, total::float8 total
         from public.orders where id = $1`, [orderId]);
    const p = priced[0];
    console.log(`\nserver priced it    : subtotal ${p.subtotal}, fee ${p.fee}, discount ${p.disc}, total ${p.total}`);
    console.log(`expected            : subtotal ${EXPECTED_SUBTOTAL}, fee ${EXPECTED_FEE}, total ${EXPECTED_TOTAL}`);

    const { rows: items } = await client.query(
      `select item_id, quantity, price::float8 price from public.order_items where order_id = $1 order by item_id`, [orderId]);
    console.log("\nstored line items:");
    console.table(items);

    if (p.subtotal !== EXPECTED_SUBTOTAL || p.fee !== EXPECTED_FEE || p.total !== EXPECTED_TOTAL) {
      ok = false;
      console.log("\nMISMATCH — the triggers did not price this as expected");
    } else {
      console.log("\nPRICING CORRECT — prices came from the catalogue, not the client");
    }
  } catch (e) {
    ok = false;
    try { await client.query("rollback"); } catch {}
    console.log(`FAILED: ${e.message}${e.code ? ` (${e.code})` : ""}`);
  } finally {
    if (orderId) {
      await client.query(`delete from public.order_items where order_id = $1`, [orderId]);
      await client.query(`delete from public.orders where id = $1`, [orderId]);
      console.log("\n(probe order deleted)");
    }
    await client.end();
  }
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
