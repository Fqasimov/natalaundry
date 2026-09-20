/**
 * What an account is actually made of, before writing anything that deletes one.
 *
 * Account deletion is the one operation that cannot be tested by running it, so
 * the shape has to be known first: every foreign key that points at a user, what
 * each one does on delete, and which columns hold personal data. A cascade
 * nobody knew about takes the order history with the customer; a `no action`
 * makes the delete fail at the last step instead.
 *
 * Reads only. Run: node scripts/migration/inspect-account-deletion.js
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

const ACTION = {
  a: "no action",
  r: "restrict",
  c: "CASCADE",
  n: "set null",
  d: "set default",
};

(async () => {
  await client.connect();

  // Everything pointing at a user, directly or through profiles.
  const { rows: fks } = await client.query(`
    select c.conname,
           c.conrelid::regclass::text as child,
           c.confrelid::regclass::text as parent,
           c.confdeltype as on_delete,
           (select string_agg(a.attname, ', ' order by k.ord)
              from unnest(c.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum)
             as cols
      from pg_constraint c
     where c.contype = 'f'
       and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
     order by parent, child`);

  console.log("=== foreign keys pointing at a user ===");
  for (const f of fks) {
    console.log(
      `  ${f.child.padEnd(34)} (${f.cols}) -> ${f.parent.padEnd(16)} on delete ${ACTION[f.on_delete]}`
    );
  }

  // Columns that would still identify someone after the auth row is gone.
  const { rows: cols } = await client.query(`
    select table_name, column_name
      from information_schema.columns
     where table_schema = 'public'
       and (column_name ~* 'name|phone|email|address|lat|lng|note'
            or table_name in ('profiles', 'addresses'))
     order by table_name, ordinal_position`);

  console.log("\n=== columns that can identify a person ===");
  let current = null;
  for (const c of cols) {
    if (c.table_name !== current) {
      current = c.table_name;
      process.stdout.write(`\n  ${current}: `);
    }
    process.stdout.write(`${c.column_name} `);
  }
  console.log("\n");

  // How much is actually at stake for one account.
  const { rows: counts } = await client.query(`
    select (select count(*) from public.profiles) as profiles,
           (select count(*) from auth.users) as auth_users,
           (select count(*) from public.orders) as orders`);
  console.log("=== totals ===");
  console.log(`  profiles=${counts[0].profiles} auth.users=${counts[0].auth_users} orders=${counts[0].orders}`);

  // Whether a SECURITY DEFINER function owned by this role could delete an
  // auth user at all. If not, deletion has to go through an Edge Function.
  const { rows: owner } = await client.query(`
    select current_user as role,
           has_table_privilege(current_user, 'auth.users', 'DELETE') as can_delete_auth_users`);
  console.log(`  connected as ${owner[0].role}, delete on auth.users = ${owner[0].can_delete_auth_users}`);
})()
  .catch((e) => {
    console.error("FAILED:", e.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
