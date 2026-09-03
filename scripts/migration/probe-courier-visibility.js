/**
 * What can a courier actually see about a job and its customer once assigned?
 * Read-only, always rolled back. Credentials never printed.
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
  const { rows: c } = await client.query(
    `select id from auth.users where email = 'info@1nci.az'`);
  const courierId = c[0].id;

  // Take the newest real order and put this courier on it, inside a
  // transaction we roll back, so we can see the assigned-courier view.
  const { rows: o } = await client.query(
    `select id, user_id from public.orders
      where address is not null and address <> 'probe'
      order by created_at desc limit 1`);
  const order = o[0];

  await client.query("begin");
  await client.query(
    `update public.orders set courier_id = $2, lifecycle_state = 'courier_assigned'
      where id = $1`, [order.id, courierId]);

  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: courierId, role: "authenticated", aud: "authenticated" })]);
  await client.query("set local role authenticated");

  const { rows: seen } = await client.query(
    `select order_no, address, address_lat, address_lng, notes,
            collection_time, delivery_time, total::float8 total,
            payment_method, item_photos
       from public.orders where id = $1`, [order.id]);
  console.log("=== the order, as the assigned courier sees it ===");
  console.table(seen);

  const { rows: items } = await client.query(
    `select item_name, quantity from public.order_items where order_id = $1`, [order.id]);
  console.log(`=== line items visible: ${items.length} ===`);
  console.table(items.slice(0, 5));

  const { rows: cust } = await client.query(
    `select id, name, phone, email from public.profiles where id = $1`, [order.user_id]);
  console.log(`=== the customer's profile: ${cust.length} row(s) ===`);
  console.table(cust);

  await client.query("reset role");
  await client.query("rollback");

  // How many real orders even carry coordinates? Without them the Navigate
  // button never appears.
  const { rows: coords } = await client.query(
    `select count(*)::int as total,
            count(address_lat)::int as with_coords
       from public.orders`);
  console.log("=== coordinates across all orders ===");
  console.table(coords);

  await client.end();
})().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
