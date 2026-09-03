/** Aligns reward titles/descriptions with the renamed catalogue items. Credentials never printed. */
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

// [item_id, new title or null to keep, new description]
const UPDATES = [
  ["dc-dress-1", "Pulsuz Don Təmizləmə", "1 ədəd Don tam ödənişsiz"],
  ["ac-bg-2", "Pulsuz Çanta Təmizləmə", "1 ədəd Çanta – Sadə tam ödənişsiz"],
  ["hm-bd-6", null, "1 ədəd Yorğan – Birnəfərlik tam ödənişsiz"],
  ["hm-bt-1", null, "1 ədəd Kiçik dəsmal tam ödənişsiz"],
];

(async () => {
  await client.connect();
  for (const [itemId, title, description] of UPDATES) {
    const { rows } = await client.query(
      `update public.rewards
          set title = coalesce($2, title), description = $3
        where value->>'item_id' = $1
        returning title, description`,
      [itemId, title, description]
    );
    for (const r of rows) console.log(`${itemId.padEnd(12)} ${r.title} — ${r.description}`);
  }
  await client.end();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
