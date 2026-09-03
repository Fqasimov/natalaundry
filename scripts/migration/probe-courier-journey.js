/**
 * Drives a whole courier job against the live database, as the courier's own
 * JWT claims — the list, the claim, the lifecycle steps and a location ping.
 *
 * Creates its own throwaway order and deletes it at the end, so it never
 * touches a real customer's job.
 *
 * usage: node scripts/migration/probe-courier-journey.js [courier-email]
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

const COURIER_EMAIL = process.argv[2] || "info@1nci.az";
const CUSTOMER_EMAIL = "faiq.farid0604@gmail.com";
const ADMIN_EMAIL = "admin@natalaundry.test";

let orderId = null;
let problems = 0;

const say = (ok, label, detail = "") => {
  if (!ok) problems++;
  console.log(`${ok ? "  ok  " : "BAD   "}${label.padEnd(44)}${detail}`);
};

/**
 * Runs `fn` as `userId`, inside a savepoint.
 *
 * The savepoint is the point: an expected failure — "this order was not
 * offered to you" — aborts the whole transaction in Postgres, and every
 * command after it is refused with "current transaction is aborted" until
 * something rolls back. Fencing each attempt keeps one deliberate refusal
 * from taking the rest of the probe (and its cleanup) down with it.
 */
async function as(userId, fn) {
  await client.query("savepoint probe");
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: "authenticated", aud: "authenticated" })]);
  await client.query("set local role authenticated");
  try {
    const out = await fn();
    await client.query("release savepoint probe");
    return out;
  } catch (e) {
    await client.query("rollback to savepoint probe");
    throw e;
  } finally {
    await client.query("reset role");
  }
}

(async () => {
  await client.connect();

  const ids = {};
  for (const [key, email] of [["courier", COURIER_EMAIL], ["customer", CUSTOMER_EMAIL],
                              ["admin", ADMIN_EMAIL]]) {
    const { rows } = await client.query(`select id from auth.users where email = $1`, [email]);
    if (!rows.length) throw new Error(`no account for ${email}`);
    ids[key] = rows[0].id;
  }
  const { rows: role } = await client.query(
    `select role from public.profiles where id = $1`, [ids.courier]);
  console.log(`courier: ${COURIER_EMAIL} (role ${role[0].role})\n`);

  // ── a throwaway job to work on ────────────────────────────────────────────
  const { rows: o } = await client.query(
    `insert into public.orders (user_id, subtotal, total, delivery_tier, collection_time,
       delivery_time, address, is_outside_city, item_photos, payment_method)
     values ($1, 0, 0, 'standard', 'probe', 'probe', 'Probe küçəsi 1', false, '[]'::jsonb, 'cash')
     returning id, dispatch_state, status, lifecycle_state`, [ids.customer]);
  orderId = o[0].id;
  console.log(`created probe order ${orderId}`);
  console.log(`  opens as: dispatch_state=${o[0].dispatch_state} status=${o[0].status} lifecycle=${o[0].lifecycle_state}\n`);

  await client.query(`insert into public.order_items (order_id, service_id, item_id, item_name, quantity, price)
                      values ($1, 'dryCleaning', 'dc-shirt-1', 'T-Shirt', 3, 0)`, [orderId]);

  // ── 1. what the courier's list query returns ──────────────────────────────
  await client.query("begin");
  const listed = await as(ids.courier, async () => {
    const { rows } = await client.query(
      `select id, status, dispatch_state from public.orders where status = 'pending' order by created_at`);
    return rows;
  });
  await client.query("rollback");
  say(listed.some((r) => r.id === orderId),
    "brand-new order appears in the courier list",
    `(${listed.length} pending listed)`);
  const awaiting = listed.filter((r) => r.dispatch_state === "awaiting_admin").length;
  console.log(`       of those, ${awaiting} are still awaiting_admin — not offered to anyone`);

  // ── 2. claiming one that was never offered ────────────────────────────────
  await client.query("begin");
  let early;
  try {
    // Deliberately not caught inside `as`: the savepoint has to see the error.
    early = await as(ids.courier, async () => {
      const { rows } = await client.query(`select public.claim_order($1) as ok`, [orderId]);
      return `RETURNED ${rows[0].ok}`;
    });
  } catch (e) {
    early = `REFUSED — ${e.message.split("\n")[0]}`;
  }
  await client.query("rollback");
  say(early.startsWith("REFUSED"), "claiming an un-offered order is refused", early);

  // ── 3. the admin broadcasts it ────────────────────────────────────────────
  //
  // Exactly what Laravel's OrderLifecycleService::broadcast does: a
  // courier_assignments row per courier, then the lifecycle moves to
  // assigning_couriers. The id is left out deliberately — it now has a
  // default, and before the fix this insert failed outright.
  await client.query(
    `insert into public.courier_assignments (order_id, courier_id, offered_at, created_at)
     values ($1, $2, now(), now())`, [orderId, ids.courier]);

  const { rows: mirrored } = await client.query(
    `select count(*)::int as n from public.order_offers
      where order_id = $1 and courier_id = $2`, [orderId, ids.courier]);
  say(mirrored[0].n === 1, "assignment mirrored into order_offers",
    `(${mirrored[0].n} offer row)`);

  await client.query("begin");
  await as(ids.admin, async () => {
    await client.query(`select public.transition_order($1, 'assigning_couriers')`, [orderId]);
  });
  await client.query("commit");
  console.log("\n  --  admin broadcast the job  --\n");

  // ── 4. the claim, through the same path the app uses ──────────────────────
  await client.query("begin");
  let claimed;
  try {
    claimed = await as(ids.courier, async () => {
      await client.query(`select public.transition_order($1, 'courier_assigned')`, [orderId]);
      return true;
    });
    await client.query("commit");
  } catch (e) {
    claimed = `REFUSED — ${e.message.split("\n")[0]}`;
    await client.query("rollback");
  }
  say(claimed === true, "courier claims the broadcast job", `${claimed}`);

  const { rows: afterClaim } = await client.query(
    `select courier_id, dispatch_state, status, lifecycle_state from public.orders where id = $1`, [orderId]);
  const a = afterClaim[0];
  say(a.courier_id === ids.courier, "order is assigned to this courier");
  say(a.lifecycle_state === "courier_assigned", "lifecycle_state advanced with the claim",
    `= ${a.lifecycle_state}`);
  // `pending` is correct here: the courier has accepted the job but has not
  // set off, and the legacy status column only moves to 'collecting' when they
  // do. Asserting otherwise was this probe being wrong, not the app.
  console.log(`       status is '${a.status}' at courier_assigned, by design`);

  // A ping before the courier sets off must be refused: the policy allows
  // locations only while the order is actually being travelled to or from.
  await client.query("begin");
  let earlyPing;
  try {
    earlyPing = await as(ids.courier, async () => {
      await client.query(
        `insert into public.courier_locations (courier_id, order_id, lat, lng)
         values ($1, $2, 40.4093, 49.8671)`, [ids.courier, orderId]);
      return "ALLOWED";
    });
  } catch (e) {
    earlyPing = `REFUSED — ${e.message.split("\n")[0]}`;
  }
  await client.query("rollback");
  say(earlyPing.startsWith("REFUSED"), "location ping before setting off is refused");

  // ── 6. walking the lifecycle ──────────────────────────────────────────────
  // The real state names, read off transition_order's own table rather than
  // invented: an earlier run of this probe used at_facility / processing /
  // ready_for_delivery, none of which exist, and every step "failed" for that
  // reason instead of the one that mattered.
  //
  // Each step is tried as the courier first and, if the state machine says
  // that actor may not take it, as the admin — which is how the laundry-side
  // steps are meant to work.
  const STEPS = ["courier_en_route_pickup", "picked_up", "at_laundry",
                 "processing_finished", "courier_en_route_delivery", "delivered"];
  const move = async (actor, step) => {
    await client.query("begin");
    try {
      await as(ids[actor], async () => {
        await client.query(`select public.transition_order($1, $2)`, [orderId, step]);
      });
      await client.query("commit");

      // Read the result as the owner, not as the actor. There is no admin
      // SELECT policy on `orders`, so an admin reading back the row it just
      // moved sees nothing — which looked like the transition failing.
      const { rows } = await client.query(
        `select status, lifecycle_state from public.orders where id = $1`, [orderId]);
      return `-> ${rows[0].lifecycle_state} / status ${rows[0].status}`;
    } catch (e) {
      await client.query("rollback");
      return `REFUSED — ${e.message.split("\n")[0]}`;
    }
  };

  for (const step of STEPS) {
    let actor = "courier";
    let res = await move(actor, step);

    // The laundry-side step belongs to the admin, so a courier refusal here is
    // the state machine working, not a fault.
    if (res.includes("may not move")) {
      actor = "admin";
      res = await move(actor, step);
    }

    const ok = !res.startsWith("REFUSED");
    if (!ok) problems++;
    console.log(`${ok ? "  ok  " : "BAD   "}${`${step} (${actor})`.padEnd(44)}${res}`);

    // Tracking is allowed only while actually travelling. Ping at exactly
    // those two moments, which is when the app's broadcaster runs.
    if (ok && (step === "courier_en_route_pickup" || step === "courier_en_route_delivery")) {
      await client.query("begin");
      let ping;
      try {
        ping = await as(ids.courier, async () => {
          await client.query(
            `insert into public.courier_locations (courier_id, order_id, lat, lng)
             values ($1, $2, 40.4093, 49.8671)`, [ids.courier, orderId]);
          return "ALLOWED";
        });
      } catch (e) {
        ping = `REFUSED — ${e.message.split("\n")[0]}`;
      }
      await client.query("rollback");
      say(ping === "ALLOWED", `  location ping during ${step}`, ping);
    }
  }

  console.log(`\n${problems ? `${problems} problem(s)` : "courier journey clean"}`);
})()
  .catch((e) => { console.error(`FAILED: ${e.message}`); problems++; })
  .finally(async () => {
    if (orderId) {
      try {
        // Whatever state the probe ended in, get back to a usable connection
        // before deleting: an aborted transaction refuses every command, which
        // is how an earlier run left its probe order behind.
        await client.query("rollback").catch(() => {});
        await client.query("reset role").catch(() => {});
        await client.query(`delete from public.courier_locations where order_id = $1`, [orderId]);
        await client.query(`delete from public.order_offers where order_id = $1`, [orderId]);
        await client.query(`delete from public.order_items where order_id = $1`, [orderId]);
        await client.query(`delete from public.orders where id = $1`, [orderId]);
        console.log("(probe order deleted)");
      } catch (e) { console.error(`cleanup failed: ${e.message} — order ${orderId} may remain`); }
    }
    await client.end();
    process.exit(problems ? 1 : 0);
  });
