/** Can a courier flip their own shift flag, and only their own? Rolled back. */
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
  const { rows: u } = await client.query(
    `select id from auth.users where email = 'info@1nci.az'`);
  const courierId = u[0].id;

  const attempt = async (label, sql, params, expect) => {
    await client.query("begin");
    let outcome;
    try {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: courierId, role: "authenticated", aud: "authenticated" })]);
      await client.query("set local role authenticated");
      const r = await client.query(sql, params);
      outcome = r.rowCount > 0 ? "ALLOWED" : "NO-OP (filtered by RLS)";
    } catch (e) {
      outcome = `REFUSED — ${e.message.split("\n")[0]}`;
    }
    await client.query("rollback");
    const ok = outcome.startsWith(expect);
    console.log(`${ok ? "  ok  " : "BAD   "}${label.padEnd(42)}${outcome}`);
    return ok;
  };

  let fail = 0;
  if (!await attempt("go on shift", `update public.courier_details set is_active = true where id = $1`,
    [courierId], "ALLOWED")) fail++;
  if (!await attempt("write own position",
    `update public.courier_details set current_lat = 40.4, current_lng = 49.8,
      last_location_update = now() where id = $1`, [courierId], "ALLOWED")) fail++;
  if (!await attempt("put another courier on shift",
    `update public.courier_details set is_active = true where id <> $1`, [courierId], "NO-OP")) fail++;

  console.log(`\n${fail ? `${fail} problem(s)` : "shift toggle works and is scoped to self"}`);
  await client.end();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(`FAILED: ${e.message}`); process.exit(1); });
