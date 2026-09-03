/**
 * Compares lib/catalog.ts (what the app sends) against public.service_prices
 * (what enforce_item_price will accept). Read-only. Credentials never printed.
 *
 * Run the compile step first:
 *   npx tsc lib/catalog.ts --outDir <tmp> --module commonjs --target es2020
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const compiled = process.argv[2];
if (!compiled) {
  console.error("usage: node catalog-diff.js <path-to-compiled-catalog.js>");
  process.exit(2);
}
const { CATALOG } = require(compiled);

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
    `select item_id, service_id, name, price::float8 as price, active from public.service_prices order by service_id, item_id`);
  await client.end();

  const appItems = [];
  for (const s of CATALOG)
    for (const c of s.categories)
      for (const i of c.items)
        appItems.push({ serviceId: s.serviceId, itemId: i.itemId, name: i.name, price: i.price });

  const dbById = new Map(rows.map((r) => [r.item_id, r]));
  const appById = new Map(appItems.map((i) => [i.itemId, i]));

  const accepted = appItems.filter((i) => dbById.has(i.itemId));
  const rejected = appItems.filter((i) => !dbById.has(i.itemId));
  const unusedDb = rows.filter((r) => !appById.has(r.item_id));

  console.log(`app catalogue items : ${appItems.length}`);
  console.log(`service_prices rows : ${rows.length}`);
  console.log(`\nWOULD BE ACCEPTED by enforce_item_price : ${accepted.length}`);
  console.log(`WOULD BE REJECTED (unknown item_id)      : ${rejected.length}`);
  console.log(`service_prices rows the app never uses   : ${unusedDb.length}`);

  if (rejected.length) {
    console.log("\n--- first 10 rejected ---");
    console.table(rejected.slice(0, 10));
  }
  console.log("\n--- first 10 unused db rows ---");
  console.table(unusedDb.slice(0, 10));

  // Where an item exists on both sides, do the prices agree?
  const priceGaps = accepted
    .map((i) => ({ itemId: i.itemId, app: i.price, db: dbById.get(i.itemId).price }))
    .filter((r) => r.app !== r.db);
  console.log(`\nprice disagreements among matched items: ${priceGaps.length}`);
  if (priceGaps.length) console.table(priceGaps.slice(0, 20));

  fs.writeFileSync(
    path.join(__dirname, "catalog-diff.json"),
    JSON.stringify({ db: rows, app: appItems }, null, 2)
  );
  console.log("\nfull data written to scripts/migration/catalog-diff.json");
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
