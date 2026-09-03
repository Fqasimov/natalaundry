/**
 * Prints the RLS policies and grants that govern INSERT on `orders` and
 * `order_items`.
 *
 * Read-only. Credentials are read out of backend/.env by this script and are
 * never printed, never passed on a command line, and never logged.
 *
 * Usage: node scripts/migration/inspect-order-policies.js
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const envPath = path.join(__dirname, "..", "..", "backend", ".env");
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const client = new Client({
  host: env.DB_HOST,
  // 5432 is the session pooler. 6543 (transaction) is fine for reads too, but
  // the session pooler is what any follow-up DDL needs, so use it throughout.
  port: 5432,
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  ssl: { rejectUnauthorized: false },
});

const q = async (label, sql, params = []) => {
  const { rows } = await client.query(sql, params);
  console.log(`\n=== ${label} (${rows.length}) ===`);
  for (const r of rows) console.log(JSON.stringify(r, null, 2));
};

(async () => {
  await client.connect();
  console.log(`connected to ${env.DB_HOST} / ${env.DB_DATABASE}`);

  await q(
    "RLS enabled?",
    `select relname, relrowsecurity, relforcerowsecurity
       from pg_class
      where relnamespace = 'public'::regnamespace
        and relname in ('orders','order_items')`
  );

  await q(
    "policies on orders / order_items",
    `select tablename, policyname, cmd, roles, qual, with_check
       from pg_policies
      where schemaname = 'public'
        and tablename in ('orders','order_items')
      order by tablename, cmd, policyname`
  );

  await q(
    "table grants for anon / authenticated",
    `select table_name, grantee, privilege_type
       from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name in ('orders','order_items')
        and grantee in ('anon','authenticated','public')
      order by table_name, grantee, privilege_type`
  );

  await q(
    "triggers on orders",
    `select tgname, tgenabled, pg_get_triggerdef(oid) as def
       from pg_trigger
      where tgrelid = 'public.orders'::regclass and not tgisinternal
      order by tgname`
  );

  await q(
    "columns on orders",
    `select column_name, data_type, is_nullable, column_default
       from information_schema.columns
      where table_schema = 'public' and table_name = 'orders'
      order by ordinal_position`
  );

  await client.end();
})().catch((e) => {
  // Never let a connection string or password surface through an error.
  console.error("FAILED:", e.message);
  process.exit(1);
});
