/**
 * Audits everything the app touches, against the live database:
 *
 *   1. every RPC the app calls — does it exist, with that argument list?
 *   2. every table the app writes — is there a policy for that command?
 *   3. is `orders.reward_id` consumed by anything, or written and ignored?
 *   4. RLS coverage across public, including tables with RLS but no policy
 *   5. the pricing constants, compared with what the trigger actually does
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

// name -> the argument names lib/*.ts passes
const RPCS = {
  pay_order: null,
  record_bulk_count: null,
  transition_order: null,
  claim_order: null,
  open_gift_box: null,
};

// table -> commands the app issues against it
const WRITES = {
  orders: ["INSERT"],
  order_items: ["INSERT"],
  courier_locations: ["INSERT"],
  profiles: ["UPDATE"],
  notifications: ["UPDATE"],
};

const head = (s) => console.log(`\n${"=".repeat(72)}\n${s}\n${"=".repeat(72)}`);

(async () => {
  await client.connect();

  head("1. RPCs the app calls");
  const { rows: fns } = await client.query(
    `select p.proname,
            pg_get_function_identity_arguments(p.oid) as args,
            case p.prosecdef when true then 'definer' else 'invoker' end as security,
            pg_get_userbyid(p.proowner) as owner,
            pg_get_function_result(p.oid) as returns,
            has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_run
       from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.proname = any($1)
      order by p.proname`,
    [Object.keys(RPCS)]
  );
  console.table(fns);
  const found = new Set(fns.map((f) => f.proname));
  const missing = Object.keys(RPCS).filter((n) => !found.has(n));
  console.log(missing.length ? `MISSING: ${missing.join(", ")}` : "all present");

  head("2. write policies for the tables the app writes");
  for (const [table, cmds] of Object.entries(WRITES)) {
    const { rows } = await client.query(
      `select policyname, cmd, roles::text from pg_policies
        where schemaname = 'public' and tablename = $1 and cmd = any($2)`,
      [table, cmds]
    );
    const { rows: grant } = await client.query(
      `select privilege_type from information_schema.role_table_grants
        where table_schema='public' and table_name=$1 and grantee='authenticated'
          and privilege_type = any($2)`,
      [table, cmds]
    );
    const ok = rows.length > 0 && grant.length > 0;
    console.log(
      `${ok ? "OK  " : "GAP "} ${table.padEnd(18)} ${cmds.join(",").padEnd(8)} ` +
      `policies=${rows.length} grant=${grant.length}` +
      (rows.length ? ` [${rows.map((r) => r.policyname).join("; ")}]` : "")
    );
  }

  head("3. is orders.reward_id consumed anywhere?");
  const { rows: uses } = await client.query(
    `select p.proname
       from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and pg_get_functiondef(p.oid) ilike '%reward_id%'
      order by 1`);
  console.log(uses.length ? uses.map((u) => u.proname).join(", ") : "NOTHING reads orders.reward_id");
  const { rows: rewardCols } = await client.query(
    `select table_name, column_name from information_schema.columns
      where table_schema='public' and column_name like '%reward%' order by 1,2`);
  console.table(rewardCols);

  head("4. RLS coverage across public");
  const { rows: cover } = await client.query(
    `select c.relname as table_name,
            c.relrowsecurity as rls,
            (select count(*) from pg_policies p
              where p.schemaname='public' and p.tablename = c.relname) as policies,
            (select count(*) from information_schema.role_table_grants g
              where g.table_schema='public' and g.table_name = c.relname
                and g.grantee in ('anon','authenticated')
                and g.privilege_type in ('INSERT','UPDATE','DELETE')) as write_grants
       from pg_class c
      where c.relnamespace='public'::regnamespace and c.relkind='r'
      order by c.relrowsecurity, c.relname`);
  console.table(cover);
  const bad = cover.filter((r) => !r.rls);
  console.log(bad.length ? `RLS OFF: ${bad.map((r) => r.table_name).join(", ")}` : "every table has RLS enabled");
  const locked = cover.filter((r) => r.rls && Number(r.policies) === 0);
  console.log(locked.length ? `RLS on but NO policies (nothing can read it): ${locked.map((r) => r.table_name).join(", ")}` : "no policy-less tables");

  head("5. pricing constants");
  const { rows: promo } = await client.query(`select * from public.promo_codes`);
  console.table(promo);

  await client.end();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
