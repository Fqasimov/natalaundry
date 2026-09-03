/**
 * The `rewards` pool was seeded with the app's old invented item ids, none of
 * which exist in `service_prices`. A customer winning "Pulsuz T-Shirt
 * Təmizləmə" would be handed a prize naming an item that cannot be ordered.
 *
 * Rewrites `value->>'item_id'` onto the real ids. Idempotent: a row already
 * carrying a real id is left alone.
 *
 * Pass --apply to write; without it this only reports.
 * Credentials never printed.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const APPLY = process.argv.includes("--apply");

const MAP = {
  tshirt: { ironing: "ir-shirt-1", dry_cleaning: "dc-shirt-1" },
  shirt_long: { ironing: "ir-shirt-3" },
  sweater: { dry_cleaning: "dc-shirt-4" },
  trousers: { dry_cleaning: "dc-bot-1" },
  jacket: { dry_cleaning: "dc-suit-1" },
  dress_simple: { dry_cleaning: "dc-dress-1" },
  coat: { dry_cleaning: "dc-outer-4" },
  suit_2pc: { dry_cleaning: "dc-suit-3" },
  pillow: { bedding: "hm-bd-2" },
  duvet: { bedding: "hm-bd-6" },
  towel: { bedding: "hm-bt-1" },
  boot: { shoes: "sh-6" },
  bag_medium: { bags: "ac-bg-2" },
};

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

  const { rows: valid } = await client.query(`select item_id from public.service_prices`);
  const known = new Set(valid.map((r) => r.item_id));

  const { rows } = await client.query(
    `select id, title, value->>'service_id' as service_id, value->>'item_id' as item_id
       from public.rewards
      where value ? 'item_id'
      order by title`);

  const plan = [];
  for (const r of rows) {
    if (known.has(r.item_id)) continue;
    const to = MAP[r.item_id]?.[r.service_id];
    plan.push({ title: r.title, service: r.service_id, from: r.item_id, to: to ?? "** NO MAPPING **", id: r.id });
  }

  console.log(`rewards carrying an item_id : ${rows.length}`);
  console.log(`already valid               : ${rows.length - plan.length}`);
  console.log(`to rewrite                  : ${plan.filter((p) => p.to !== "** NO MAPPING **").length}`);
  console.log(`unmapped (needs a decision) : ${plan.filter((p) => p.to === "** NO MAPPING **").length}\n`);
  console.table(plan.map(({ id, ...rest }) => rest));

  if (!APPLY) {
    console.log("\n(dry run — pass --apply to write)");
    await client.end();
    return;
  }

  let n = 0;
  for (const p of plan) {
    if (p.to === "** NO MAPPING **") continue;
    await client.query(
      `update public.rewards set value = jsonb_set(value, '{item_id}', to_jsonb($2::text)) where id = $1`,
      [p.id, p.to]);
    n++;
  }
  console.log(`\nupdated ${n} reward rows`);

  const { rows: after } = await client.query(
    `select r.title, r.value->>'item_id' as item_id,
            (r.value->>'item_id') in (select item_id from public.service_prices) as resolves
       from public.rewards r where r.value ? 'item_id' order by resolves, title`);
  console.log("\nafter:");
  console.table(after);

  await client.end();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
