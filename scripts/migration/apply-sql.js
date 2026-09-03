/**
 * Applies a .sql file to the live database over the session pooler.
 *
 * The file is sent as one statement batch, so a `begin`/`commit` inside it
 * behaves as written and any failure rolls the whole thing back.
 *
 * usage: node scripts/migration/apply-sql.js supabase/<file>.sql
 * Credentials never printed.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/migration/apply-sql.js <file.sql>");
  process.exit(2);
}
const sql = fs.readFileSync(file, "utf8");

const env = {};
for (const line of fs.readFileSync(path.join(__dirname, "..", "..", "backend", ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const client = new Client({
  host: env.DB_HOST,
  port: 5432, // session pooler — DDL needs it
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await client.connect();
  console.log(`applying ${file} (${sql.length} bytes)`);
  await client.query(sql);
  console.log("applied");
  await client.end();
})().catch(async (e) => {
  console.error(`FAILED: ${e.message}${e.position ? ` at position ${e.position}` : ""}`);
  process.exit(1);
});
