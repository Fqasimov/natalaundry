/** Read-only: order_items triggers/policies and the id vocabulary. Credentials never printed. */
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

  const { rows: trg } = await client.query(
    `select tgname, pg_get_triggerdef(oid) as def
       from pg_trigger where tgrelid = 'public.order_items'::regclass and not tgisinternal`);
  console.log("=== order_items triggers ==="); console.table(trg);

  const { rows: fn } = await client.query(
    `select p.proname, pg_get_functiondef(p.oid) as src
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('enforce_item_price','recalc_order_total','strip_client_pricing')`);
  for (const f of fn) console.log(`\n=== ${f.proname} ===\n${f.src}`);

  const { rows: svc } = await client.query(
    `select service_id, count(*) as items, min(item_id) as example
       from public.service_prices group by service_id order by service_id`);
  console.log("\n=== service_prices vocabulary ==="); console.table(svc);

  await client.end();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
