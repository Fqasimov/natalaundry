/**
 * Every policy that can permit a write, with the grants that would let a
 * client reach it. A policy alone is not access and a grant alone is not
 * access — you need both, so both are shown side by side.
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

  const { rows: grants } = await client.query(
    `select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
       from information_schema.role_table_grants
      where table_schema='public' and grantee in ('anon','authenticated')
        and privilege_type in ('INSERT','UPDATE','DELETE')
      group by table_name, grantee
      order by table_name, grantee`);
  console.log("=== write grants held by client roles ===");
  console.table(grants);

  const { rows: pols } = await client.query(
    `select tablename, policyname, cmd, roles::text, qual, with_check
       from pg_policies
      where schemaname='public' and cmd in ('INSERT','UPDATE','DELETE','ALL')
      order by tablename, cmd, policyname`);

  console.log("\n=== policies permitting a write ===");
  for (const p of pols) {
    const g = grants.find((x) => x.table_name === p.tablename);
    console.log(
      `\n${p.tablename}.${p.policyname}\n  cmd=${p.cmd} roles=${p.roles}` +
      `  grants=${g ? `${g.grantee}:${g.privs}` : "NONE (policy unreachable)"}` +
      `\n  using      : ${(p.qual ?? "-").replace(/\s+/g, " ")}` +
      `\n  with check : ${(p.with_check ?? "-").replace(/\s+/g, " ")}`
    );
  }

  await client.end();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
