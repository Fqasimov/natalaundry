/**
 * Applies supabase/account-deletion.sql and checks what landed.
 *
 * The file manages its own transaction (it ends with a verification DO block
 * that must run after the commit), so nothing is wrapped here — wrapping it
 * would nest a transaction inside its own BEGIN and the COMMIT would fail.
 *
 * The check that matters is the last one: that the function is callable by
 * `authenticated` and by nobody else. A SECURITY DEFINER function that deletes
 * auth users is the most dangerous object in this database, and EXECUTE
 * granted to `anon` would make it callable without signing in.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const root = path.join(__dirname, "..", "..");
const env = {};
for (const line of fs.readFileSync(path.join(root, "backend", ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const client = new Client({
  host: env.DB_HOST,
  port: 5432,
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await client.connect();

  // Before: nothing should be a tombstone yet, and the FK should still exist.
  const { rows: before } = await client.query(`
    select (select count(*) from public.profiles) as profiles,
           (select count(*) from auth.users) as auth_users,
           (select count(*) from public.orders) as orders`);
  console.log(
    `before: profiles=${before[0].profiles} auth.users=${before[0].auth_users} orders=${before[0].orders}`
  );

  const sql = fs.readFileSync(path.join(root, "supabase", "account-deletion.sql"), "utf8");
  client.on("notice", (n) => console.log(`  notice: ${n.message}`));
  await client.query(sql);
  console.log("  ok   supabase/account-deletion.sql");

  console.log("\n--- verification ---");

  const { rows: fk } = await client.query(`
    select count(*)::int as n from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and contype = 'f' and confrelid = 'auth.users'::regclass`);
  console.log(`  profiles -> auth.users FK present: ${fk[0].n > 0}  (expected false)`);

  const { rows: fn } = await client.query(`
    select prosecdef, proconfig, pronargs
      from pg_proc
     where proname = 'delete_my_account' and pronamespace = 'public'::regnamespace`);
  console.log(
    fn.length
      ? `  delete_my_account(): security_definer=${fn[0].prosecdef} args=${fn[0].pronargs} search_path=${(fn[0].proconfig || []).join(",")}`
      : "  delete_my_account() MISSING"
  );

  // Who can call it. `anon` must not appear.
  const { rows: acl } = await client.query(`
    select coalesce(
             (select string_agg(distinct grantee, ', ')
                from information_schema.routine_privileges
               where routine_schema = 'public'
                 and routine_name = 'delete_my_account'
                 and privilege_type = 'EXECUTE'),
             '(nobody)') as grantees`);
  console.log(`  EXECUTE granted to: ${acl[0].grantees}`);
  if (/\banon\b/.test(acl[0].grantees)) {
    console.log("  !! anon can call it — revoke before shipping");
    process.exitCode = 1;
  }

  const { rows: col } = await client.query(`
    select count(*)::int as n from information_schema.columns
     where table_schema='public' and table_name='profiles' and column_name='deleted_at'`);
  console.log(`  profiles.deleted_at exists: ${col[0].n === 1}`);

  // Nothing should have been deleted by installing this.
  const { rows: after } = await client.query(`
    select (select count(*) from public.profiles) as profiles,
           (select count(*) from auth.users) as auth_users,
           (select count(*) from public.orders) as orders,
           (select count(*) from public.profiles where deleted_at is not null) as tombstones`);
  console.log(
    `  after: profiles=${after[0].profiles} auth.users=${after[0].auth_users} ` +
      `orders=${after[0].orders} tombstones=${after[0].tombstones}`
  );
  if (
    after[0].profiles !== before[0].profiles ||
    after[0].auth_users !== before[0].auth_users ||
    after[0].orders !== before[0].orders
  ) {
    console.log("  !! row counts changed — installing this should delete nothing");
    process.exitCode = 1;
  }
})()
  .catch((e) => {
    console.error("FAILED:", e.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
