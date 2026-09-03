/** Triggers on the named tables, with their function bodies. Read-only. */
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

(async () => {
  await client.connect();
  for (const t of tables) {
    const { rows } = await client.query(
      `select tg.tgname, pg_get_triggerdef(tg.oid) as def, p.proname,
              pg_get_functiondef(p.oid) as src
         from pg_trigger tg
         join pg_proc p on p.oid = tg.tgfoid
        where tg.tgrelid = ('public.' || $1)::regclass and not tg.tgisinternal`, [t]);
    console.log(`\n===== ${t}: ${rows.length} trigger(s) =====`);
    for (const r of rows) {
      console.log(`\n${r.def}\n`);
      console.log(r.src);
    }
  }
  await client.end();
})().catch((e) => { console.error(`FAILED: ${e.message}`); process.exitCode = 1; });
