/**
 * Reproduces the checkout writes under RLS as a real customer, in a
 * transaction that is ALWAYS rolled back. Credentials never printed.
 *
 * Usage: node scripts/migration/probe-order-insert.js [email]
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

const asUser = async (userId) => {
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: "authenticated", aud: "authenticated" }),
  ]);
  await client.query("set local role authenticated");
};

const ORDER_INSERT = `
  insert into public.orders (
    user_id, subtotal, total, delivery_tier, collection_time, delivery_time,
    address, address_lat, address_lng, notes, is_outside_city, item_photos,
    promo_code, payment_method
  ) values ($1, 0, 0, 'standard', 'Sabah, 09:00-12:00', 'Bazar ertəsi, 09:00-12:00',
    'Test küçəsi 1', 40.4093, 49.8671, null, false, '[]'::jsonb, null, 'cash')
  returning id`;

(async () => {
  await client.connect();

  const email = process.argv[2] || "faiq.farid0604@gmail.com";
  const { rows: u } = await client.query(`select id from auth.users where email = $1`, [email]);
  if (!u.length) throw new Error(`no such user: ${email}`);
  const userId = u[0].id;
  console.log(`acting as ${email} (${userId})\n`);

  // A real line item straight out of the catalogue, so enforce_item_price has
  // something legitimate to price.
  const { rows: sp } = await client.query(
    `select * from public.service_prices limit 3`
  );
  console.log("sample service_prices rows:");
  console.table(sp);

  await client.query("begin");
  try {
    await asUser(userId);

    const { rows: o } = await client.query(ORDER_INSERT, [userId]);
    console.log(`\norders INSERT: OK (${o[0].id})`);

    const orderId = o[0].id;
    const item = sp[0];
    try {
      await client.query(
        `insert into public.order_items (order_id, service_id, item_id, item_name, quantity, price)
         values ($1, $2, $3, $4, 1, 0)`,
        [orderId, item.service_id ?? "dry_cleaning", item.item_id ?? item.id, item.name ?? "test"]
      );
      console.log("order_items INSERT: OK");
    } catch (e) {
      console.log(`order_items INSERT: REFUSED — ${e.message}${e.code ? ` (${e.code})` : ""}`);
    }
  } catch (e) {
    console.log(`orders INSERT: REFUSED — ${e.message}${e.code ? ` (${e.code})` : ""}`);
  } finally {
    await client.query("rollback");
    console.log("\n(rolled back — nothing written)");
  }

  await client.end();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
