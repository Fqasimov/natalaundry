/**
 * Removes orders left behind by a probe script that failed before its own
 * cleanup ran. Matches only the literal address the probes write, so a real
 * order can never be caught by it.
 *
 * usage: node scripts/migration/clean-probe-orders.js [--apply]
 * Credentials never printed.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const APPLY = process.argv.includes("--apply");
const PROBE_ADDRESSES = ["Probe küçəsi 1", "probe", "Test küçəsi 1"];

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
    `select id, order_no, created_at, address, status, total::float8 total
       from public.orders where address = any($1) order by created_at`,
    [PROBE_ADDRESSES]);

  console.log(`probe orders found: ${rows.length}`);
  console.table(rows.map(({ id, ...r }) => r));
  if (!rows.length || !APPLY) {
    if (rows.length) console.log("\n(dry run — pass --apply to delete)");
    await client.end();
    return;
  }

  const ids = rows.map((r) => r.id);
  await client.query("begin");
  for (const t of ["courier_locations", "order_offers", "order_items"]) {
    const r = await client.query(`delete from public.${t} where order_id = any($1::uuid[])`, [ids]);
    if (r.rowCount) console.log(`  removed ${r.rowCount} from ${t}`);
  }
  const del = await client.query(`delete from public.orders where id = any($1::uuid[])`, [ids]);
  await client.query("commit");
  console.log(`deleted ${del.rowCount} probe order(s)`);

  const { rows: n } = await client.query(`select count(*)::int as orders from public.orders`);
  console.log(`orders remaining: ${n[0].orders}`);
  await client.end();
})().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
