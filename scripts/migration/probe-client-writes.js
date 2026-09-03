/**
 * What can an ordinary signed-in customer actually write? Each attempt runs
 * as `authenticated` with a real user's claims, inside a transaction that is
 * ALWAYS rolled back.
 *
 * "REFUSED" is the desired result for everything except the profile edit,
 * which the app performs on the settings screen and must be allowed.
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

let pass = 0, fail = 0;

async function attempt({ what, sql, params = [], expect }, userId) {
  await client.query("begin");
  let outcome, detail = "";
  try {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: "authenticated", aud: "authenticated" }),
    ]);
    await client.query("set local role authenticated");
    const r = await client.query(sql, params);
    outcome = r.rowCount > 0 ? "ALLOWED" : "NO-OP";
  } catch (e) {
    outcome = "REFUSED";
    detail = e.message.split("\n")[0];
  } finally {
    await client.query("rollback");
  }
  // A silent NO-OP on an UPDATE means RLS filtered every row: also a refusal.
  const effective = outcome === "NO-OP" ? "REFUSED" : outcome;
  const ok = effective === expect;
  ok ? pass++ : fail++;
  console.log(
    `${ok ? "  ok  " : "FAIL  "}${what.padEnd(46)} ${effective.padEnd(8)}` +
    `${ok ? "" : `(wanted ${expect}) `}${detail ? `— ${detail}` : ""}`
  );
}

(async () => {
  await client.connect();
  const { rows: u } = await client.query(
    `select id from auth.users where email = $1`, ["faiq.farid0604@gmail.com"]);
  const userId = u[0].id;

  const CASES = [
    { what: "change a catalogue price", expect: "REFUSED",
      sql: `update public.service_prices set price = 0.01 where item_id = 'dc-shirt-1'` },
    { what: "add a catalogue item", expect: "REFUSED",
      sql: `insert into public.service_prices (item_id, service_id, name, price, active)
            values ('hax-1', 'dryCleaning', 'free stuff', 0, true)` },
    { what: "delete a catalogue item", expect: "REFUSED",
      sql: `delete from public.service_prices where item_id = 'dc-shirt-1'` },
    { what: "credit own wallet", expect: "REFUSED",
      sql: `insert into public.wallet_transactions (user_id, amount, kind, note)
            values ($1, 1000, 'reward', 'hax')`, params: [userId] },
    { what: "mark a payment paid", expect: "REFUSED",
      sql: `insert into public.payments (order_id, amount, status, payment_method)
            select id, 0, 'paid', 'cash' from public.orders limit 1` },
    { what: "write a settled payment intent", expect: "REFUSED",
      sql: `insert into public.payment_intents (user_id, purpose, amount, status)
            values ($1, 'wallet_topup', 500, 'settled')`, params: [userId] },
    { what: "assign an order to self (order_offers)", expect: "REFUSED",
      sql: `insert into public.order_offers (order_id, courier_id)
            select id, $1 from public.orders limit 1`, params: [userId] },
    { what: "promote self to admin", expect: "REFUSED",
      sql: `update public.profiles set role = 'admin' where id = $1`, params: [userId] },
    { what: "give self loyalty points", expect: "REFUSED",
      sql: `update public.profiles set points = 99999 where id = $1`, params: [userId] },
    { what: "top up own wallet balance", expect: "REFUSED",
      sql: `update public.profiles set wallet_balance = 500 where id = $1`, params: [userId] },
    { what: "edit someone else's profile", expect: "REFUSED",
      sql: `update public.profiles set name = 'hax' where id <> $1`, params: [userId] },
    { what: "edit own name and phone (app does this)", expect: "ALLOWED",
      sql: `update public.profiles set name = 'Farid', phone = '+994500000000' where id = $1`,
      params: [userId] },
    { what: "read another customer's order", expect: "REFUSED",
      sql: `update public.orders set notes = 'hax' where user_id <> $1`, params: [userId] },
    { what: "rewrite a notification's text", expect: "REFUSED",
      sql: `update public.notifications set title = 'hax' where user_id = $1`, params: [userId] },
    { what: "send self a notification", expect: "REFUSED",
      sql: `insert into public.notifications (user_id, title, body, kind)
            values ($1, 'hax', 'hax', 'system')`, params: [userId] },
    { what: "mark own notification read (app does this)", expect: "ALLOWED",
      sql: `update public.notifications set read = true where user_id = $1`, params: [userId] },
    { what: "file an order in an advanced state", expect: "REFUSED",
      sql: `insert into public.orders (user_id, subtotal, total, delivery_tier, collection_time,
              delivery_time, address, is_outside_city, item_photos, payment_method, lifecycle_state)
            values ($1, 0, 0, 'standard', 'p', 'p', 'p', false, '[]'::jsonb, 'cash', 'delivered')`,
      params: [userId] },
  ];

  for (const c of CASES) await attempt(c, userId);

  console.log(`\n${pass} ok, ${fail} failed`);
  await client.end();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
