/**
 * Why the gift box fails. Read-only; credentials never printed.
 *
 * fetchGiftBoxes() asks PostgREST to embed `rewards(...)` inside a
 * `user_rewards` select. PostgREST can only do that when a foreign key joins
 * the two — without one it answers PGRST200 "Could not find a relationship",
 * which the app surfaces as a failure to load.
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

  const { rows: fks } = await client.query(`
    select tc.table_name, kcu.column_name, ccu.table_name as references_table,
           ccu.column_name as references_column, tc.constraint_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name
     where tc.constraint_type = 'FOREIGN KEY'
       and tc.table_schema = 'public'
       and tc.table_name in ('user_rewards','gift_box_openings','rewards')
     order by tc.table_name`);
  console.log("=== foreign keys on the reward tables ===");
  console.table(fks);

  const hasRewardFk = fks.some(
    (f) => f.table_name === "user_rewards" && f.references_table === "rewards");
  console.log(hasRewardFk
    ? "user_rewards -> rewards FK present: PostgREST can embed rewards(...)"
    : "MISSING user_rewards -> rewards FK: the embed in fetchGiftBoxes cannot work");

  for (const t of ["rewards", "user_rewards", "gift_box_openings"]) {
    const { rows } = await client.query(`select count(*)::int as n from public.${t}`);
    const { rows: pol } = await client.query(
      `select policyname, cmd from pg_policies where schemaname='public' and tablename=$1`, [t]);
    console.log(`\n${t}: ${rows[0].n} rows, ${pol.length} policy/policies`);
    console.table(pol);
  }

  // Can a customer read the pieces the gift box needs?
  const { rows: u } = await client.query(
    `select id from auth.users where email = 'faiq.farid0604@gmail.com'`);
  await client.query("begin");
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: u[0].id, role: "authenticated", aud: "authenticated" })]);
  await client.query("set local role authenticated");

  for (const [label, sql] of [
    ["rewards (the prize pool)", `select count(*)::int as n from public.rewards`],
    ["own user_rewards", `select count(*)::int as n from public.user_rewards`],
    ["own gift_box_openings", `select count(*)::int as n from public.gift_box_openings`],
    ["completed orders", `select count(*)::int as n from public.orders where status = 'completed'`],
  ]) {
    try {
      const { rows } = await client.query(sql);
      console.log(`  ok  ${label.padEnd(28)} ${rows[0].n} visible`);
    } catch (e) {
      console.log(`BAD   ${label.padEnd(28)} ${e.message.split("\n")[0]}`);
    }
  }
  await client.query("rollback");

  await client.end();
})().catch((e) => { console.error(`FAILED: ${e.message}`); process.exitCode = 1; });
