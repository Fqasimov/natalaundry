/**
 * The app makes TWO separate requests: insert the order, then insert its
 * items. This reproduces that faithfully — two transactions, committed like
 * the real thing — and then deletes whatever it created.
 *
 * Also reports ownership and BYPASSRLS, which decide whether the SECURITY
 * DEFINER trigger on order_items can update `orders` under FORCE ROW SECURITY.
 *
 * Credentials never printed.
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

  const { rows: own } = await client.query(`
    select 'table orders' as what, pg_get_userbyid(relowner) as owner, relrowsecurity as rls, relforcerowsecurity as forced
      from pg_class where oid = 'public.orders'::regclass
    union all
    select 'fn recalc_order_total', pg_get_userbyid(proowner), null, null
      from pg_proc where proname = 'recalc_order_total' and pronamespace = 'public'::regnamespace`);
  console.log("=== ownership ==="); console.table(own);

  const { rows: roles } = await client.query(
    `select rolname, rolsuper, rolbypassrls from pg_roles
      where rolname in ('postgres','authenticated','anon','authenticator','supabase_admin')`);
  console.log("=== roles ==="); console.table(roles);

  const { rows: pol } = await client.query(
    `select policyname, cmd from pg_policies where schemaname='public' and tablename='orders' and cmd in ('UPDATE','ALL')`);
  console.log(`=== UPDATE policies on orders: ${pol.length} ===`); console.table(pol);

  const { rows: u } = await client.query(
    `select id from auth.users where email = $1`, ["faiq.farid0604@gmail.com"]);
  const userId = u[0].id;

  const claims = JSON.stringify({ sub: userId, role: "authenticated", aud: "authenticated" });
  let orderId = null;

  // --- request 1: create the order (committed, exactly like the app) ---
  await client.query("begin");
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
  await client.query("set local role authenticated");
  const { rows: o } = await client.query(
    `insert into public.orders (user_id, subtotal, total, delivery_tier, collection_time,
       delivery_time, address, is_outside_city, item_photos, payment_method)
     values ($1, 0, 0, 'standard', 'probe', 'probe', 'probe', false, '[]'::jsonb, 'cash')
     returning id`, [userId]);
  orderId = o[0].id;
  await client.query("commit");
  console.log(`\nrequest 1 — orders INSERT: OK (${orderId})`);

  // --- request 2: add the items (separate transaction, like the app) ---
  try {
    await client.query("begin");
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    await client.query("set local role authenticated");
    await client.query(
      `insert into public.order_items (order_id, service_id, item_id, item_name, quantity, price)
       values ($1, 'dryCleaning', 'dc-shirt-1', 'T-Shirt', 2, 0)`, [orderId]);
    await client.query("commit");
    console.log("request 2 — order_items INSERT: OK");
  } catch (e) {
    await client.query("rollback");
    console.log(`request 2 — order_items INSERT: REFUSED — ${e.message}${e.code ? ` (${e.code})` : ""}`);
  }

  // --- clean up as the owner ---
  await client.query(`delete from public.order_items where order_id = $1`, [orderId]);
  await client.query(`delete from public.orders where id = $1`, [orderId]);
  console.log("\n(probe order deleted)");

  await client.end();
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
