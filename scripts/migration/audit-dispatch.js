/** The dispatch model(s): courier_assignments vs order_offers vs dispatch_state. Read-only. */
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

  for (const t of ["courier_assignments", "order_offers", "courier_locations"]) {
    const { rows: cols } = await client.query(
      `select column_name, data_type, is_nullable, column_default
         from information_schema.columns
        where table_schema='public' and table_name=$1 order by ordinal_position`, [t]);
    const { rows: n } = await client.query(`select count(*)::int as n from public.${t}`);
    console.log(`\n=== ${t} (${n[0].n} rows) ===`);
    console.table(cols);
  }

  const { rows: ds } = await client.query(
    `select dispatch_state, lifecycle_state, count(*)::int as n
       from public.orders group by 1,2 order by 3 desc`);
  console.log("\n=== orders by dispatch_state / lifecycle_state ===");
  console.table(ds);

  await client.end();
})().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
