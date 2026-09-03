/** Prints the BEFORE INSERT trigger functions on orders. Read-only; credentials never printed. */
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

const NAMES = process.argv.slice(2);
if (!NAMES.length) NAMES.push("force_order_pending", "guard_payment_status", "enforce_bulk_deposit");

(async () => {
  await client.connect();
  const { rows } = await client.query(
    `select proname, pg_get_functiondef(oid) as src
       from pg_proc
      where pronamespace = 'public'::regnamespace and proname = any($1)
      order by proname`, [NAMES]);
  for (const r of rows) console.log(`\n===== ${r.proname} =====\n${r.src}`);
  await client.end();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
