/**
 * Runs fetchOfferedOrders()'s two queries as the courier, under RLS, to see
 * whether a broadcast job actually reaches their list. Read-only.
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

const EMAIL = process.argv[2] || "info@1nci.az";

(async () => {
  await client.connect();
  const { rows: u } = await client.query(
    `select id from auth.users where email = $1`, [EMAIL]);
  const courierId = u[0].id;

  await client.query("begin");
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: courierId, role: "authenticated", aud: "authenticated" })]);
  await client.query("set local role authenticated");

  const step = async (label, sql, params) => {
    try {
      const { rows } = await client.query(sql, params);
      console.log(`  ok  ${label.padEnd(46)} ${rows.length} row(s)`);
      if (rows.length) console.table(rows);
      return rows;
    } catch (e) {
      console.log(`BAD   ${label.padEnd(46)} ${e.message.split("\n")[0]}`);
      return [];
    }
  };

  const assignments = await step(
    "courier_assignments (unclaimed, mine)",
    `select order_id from public.courier_assignments
      where courier_id = $1 and claimed_at is null`, [courierId]);

  const ids = assignments.map((a) => a.order_id);
  if (ids.length) {
    await step(
      "orders in assigning_couriers, unassigned",
      `select order_no, lifecycle_state, total::float8 total from public.orders
        where id = any($1::uuid[]) and lifecycle_state = 'assigning_couriers'
          and courier_id is null`, [ids]);
  } else {
    console.log("\n  no assignment rows visible — the offered list will be empty");
  }

  await client.query("rollback");
  await client.end();
})().catch((e) => { console.error(`FAILED: ${e.message}`); process.exitCode = 1; });
