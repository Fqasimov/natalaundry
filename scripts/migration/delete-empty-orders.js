/**
 * Deletes the orders left behind by the failed 2026-09-03 checkouts: created
 * but with no line items and a zero total, because every item id was rejected.
 *
 * Narrow on purpose — an order with even one item, or any money on it, is
 * never touched. Prints exactly what it will remove, and requires --apply.
 *
 * Credentials never printed.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const APPLY = process.argv.includes("--apply");

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

const CANDIDATES = `
  select o.id, o.order_no, o.created_at, o.status, o.lifecycle_state,
         o.total::float8 total, o.payment_status, u.email
    from public.orders o
    left join auth.users u on u.id = o.user_id
   where o.created_at >= date '2026-09-03'
     and o.service_type = 'standard'
     and o.total = 0
     and coalesce(o.payment_status, 'pending') = 'pending'
     and o.courier_id is null
     and not exists (select 1 from public.order_items i where i.order_id = o.id)
   order by o.created_at`;

(async () => {
  await client.connect();
  const { rows } = await client.query(CANDIDATES);
  console.log(`empty failed-checkout orders: ${rows.length}`);
  console.table(rows.map(({ id, ...r }) => r));

  if (!rows.length) { await client.end(); return; }
  if (!APPLY) {
    console.log("\n(dry run — pass --apply to delete)");
    await client.end();
    return;
  }

  // Anything that references an order, so the delete cannot fail halfway.
  await client.query("begin");
  const ids = rows.map((r) => r.id);
  for (const t of ["order_offers", "order_events", "courier_locations", "gift_box_openings", "payment_intents"]) {
    const { rows: exists } = await client.query(
      `select 1 from information_schema.tables where table_schema='public' and table_name=$1`, [t]);
    if (!exists.length) continue;
    const { rows: hasCol } = await client.query(
      `select 1 from information_schema.columns
        where table_schema='public' and table_name=$1 and column_name='order_id'`, [t]);
    if (!hasCol.length) continue;
    const r = await client.query(`delete from public.${t} where order_id = any($1::uuid[])`, [ids]);
    if (r.rowCount) console.log(`  removed ${r.rowCount} row(s) from ${t}`);
  }
  const del = await client.query(`delete from public.orders where id = any($1::uuid[])`, [ids]);
  await client.query("commit");
  console.log(`\ndeleted ${del.rowCount} order(s)`);

  const { rows: after } = await client.query(
    `select count(*)::int as orders from public.orders`);
  console.log(`orders remaining: ${after[0].orders}`);
  await client.end();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
