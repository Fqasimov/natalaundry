/** Grants held by anon/authenticated on the named tables. Read-only. */
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

const tables = process.argv.slice(2);
if (!tables.length) {
  console.error("usage: node scripts/migration/show-grants.js <table> [table...]");
  process.exit(2);
}

(async () => {
  await client.connect();
  const { rows } = await client.query(
    `select table_name, grantee,
            string_agg(privilege_type, ', ' order by privilege_type) as privileges
       from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = any($1)
        and grantee in ('anon', 'authenticated')
      group by table_name, grantee
      order by table_name, grantee`, [tables]);
  console.table(rows);

  for (const t of tables) {
    const has = rows.some((r) => r.table_name === t && r.grantee === "authenticated"
      && r.privileges.includes("SELECT"));
    console.log(`${has ? "  ok  " : "BAD   "}${t.padEnd(22)}authenticated can SELECT: ${has}`);
  }
  await client.end();
})().catch((e) => { console.error(`FAILED: ${e.message}`); process.exitCode = 1; });
