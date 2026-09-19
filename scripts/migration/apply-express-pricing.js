/**
 * Applies supabase/express-doubles-delivery.sql to the live database, then
 * proves the new rule with a throwaway order that is rolled back.
 *
 * The check matters: the trigger is the last thing to touch an order and
 * silently overwrites whatever Laravel computed, so "the file ran" is not the
 * same as "the rule is in force".
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const root = path.join(__dirname, "..", "..");
const env = {};
for (const line of fs.readFileSync(path.join(root, "backend", ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const client = new Client({
  host: env.DB_HOST,
  port: 5432,
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  ssl: { rejectUnauthorized: false },
});

const sql = fs.readFileSync(path.join(root, "supabase", "express-doubles-delivery.sql"), "utf8");

(async () => {
  await client.connect();

  await client.query(sql);
  console.log("applied  supabase/express-doubles-delivery.sql");

  // Verify against a real order, rolled back. Pick any existing customer so
  // the foreign keys hold.
  // The customer role is spelled 'user' in this schema, not 'customer'.
  const { rows: who } = await client.query(
    `select id from public.profiles where role = 'user' limit 1`
  );
  if (!who.length) {
    console.log("no customer profile to test with — skipping verification");
    await client.end();
    return;
  }

  // A real catalogue row — the insert guard rejects invented item ids. Buy
  // enough of it to clear the free-delivery threshold, so the delivery fee is
  // 0 and the tier is the only thing moving the total.
  const { rows: item } = await client.query(
    `select service_id, item_id, price::float8 from public.service_prices
      where price > 0 order by price desc limit 1`
  );
  if (!item.length) throw new Error("service_prices is empty");
  const { service_id, item_id, price } = item[0];
  const quantity = Math.ceil(40 / price);
  const sub = price * quantity;
  console.log(`probe item ${service_id}/${item_id} @ ${price} x${quantity} = ${sub}`);

  for (const [tier, expected] of [["standard", sub], ["express", sub * 2]]) {
    await client.query("begin");
    try {
      const { rows: o } = await client.query(
        `insert into public.orders
           (user_id, service_type, delivery_tier, status, lifecycle_state,
            collection_time, delivery_time,
            subtotal, delivery_fee, discount, total)
         values ($1, 'standard', $2, 'pending', 'order_placed',
                 'probe', 'probe', 0, 0, 0, 0)
         returning id`,
        [who[0].id, tier]
      );
      // A single 40-manat line: free delivery, so the tier is the only variable.
      await client.query(
        `insert into public.order_items (order_id, service_id, item_id, item_name, price, quantity)
         values ($1, $2, $3, 'probe', $4, $5)`,
        [o[0].id, service_id, item_id, price, quantity]
      );
      const { rows: priced } = await client.query(
        `select subtotal::float8, delivery_fee::float8, total::float8
           from public.orders where id = $1`,
        [o[0].id]
      );
      const got = priced[0];
      const ok = got.total === expected;
      console.log(
        `${ok ? "  ok" : " BAD"}  ${tier.padEnd(9)} subtotal ${got.subtotal}  ` +
          `delivery ${got.delivery_fee}  total ${got.total}  (expected ${expected})`
      );
    } catch (e) {
      console.log(` BAD  ${tier.padEnd(9)} ${e.message.split("\n")[0]}`);
    } finally {
      // Always leave the transaction, or the connection sits "idle in
      // transaction (aborted)" and the process never exits.
      await client.query("rollback");
    }
  }
})()
  .catch((e) => {
    console.error(`FAILED: ${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => client.end());
