/**
 * Column-level privileges held by client roles. These do NOT appear in
 * information_schema.role_table_grants, which is why `profiles` looked like it
 * had no UPDATE grant while the app's profile edit worked perfectly well.
 *
 * Read-only. Credentials never printed.
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
  const { rows } = await client.query(
    `select table_name, grantee, privilege_type,
            string_agg(column_name, ', ' order by column_name) as columns
       from information_schema.column_privileges
      where table_schema='public' and grantee in ('anon','authenticated')
        and privilege_type in ('INSERT','UPDATE')
      group by table_name, grantee, privilege_type
      order by table_name, grantee, privilege_type`);
  console.log("=== column-level INSERT/UPDATE grants ===");
  for (const r of rows) {
    console.log(`\n${r.table_name} — ${r.grantee} ${r.privilege_type}\n  ${r.columns}`);
  }

  for (const t of ["wallet_transactions", "payment_intents", "payments"]) {
    const { rows: cols } = await client.query(
      `select column_name, data_type from information_schema.columns
        where table_schema='public' and table_name=$1 order by ordinal_position`, [t]);
    console.log(`\n=== ${t} columns ===`);
    console.log(cols.map((c) => `${c.column_name}:${c.data_type}`).join(", "));
  }

  await client.end();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
