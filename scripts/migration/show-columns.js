/** Prints columns for the named tables. Read-only; credentials never printed. */
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
  console.error("usage: node scripts/migration/show-columns.js <table> [table...]");
  process.exit(2);
}

(async () => {
  await client.connect();
  for (const t of tables) {
    const { rows } = await client.query(
      `select column_name, data_type, is_nullable
         from information_schema.columns
        where table_schema = 'public' and table_name = $1
        order by ordinal_position`, [t]);
    console.log(`\n== ${t} ==`);
    console.log(rows
      .map((c) => `${c.column_name}: ${c.data_type}${c.is_nullable === "NO" ? " NOT NULL" : ""}`)
      .join("\n") || "(no such table)");
  }
  await client.end();
})().catch((e) => { console.error(`FAILED: ${e.message}`); process.exitCode = 1; });
