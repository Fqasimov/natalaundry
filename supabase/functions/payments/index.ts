// Starting a card payment, without a server to run.
//
// This is the one thing the app cannot do for itself. Kapital's API needs
// credentials that must never reach a phone, and the bank has to be given a
// public URL to send the customer back to. Everything else the app used to ask
// the Laravel API for now goes straight to Postgres under RLS.
//
// Two routes:
//
//   POST { action: "order",  order_id }  pay for an order
//   POST { action: "topup",  amount }    top up Nata Balance
//
// The amount for an order is read from `orders.total` here, never taken from
// the request body. That is the whole point of this function existing rather
// than the phone calling Kapital directly: a client that names its own price
// is the bug this project already had once.

import { createClient } from "jsr:@supabase/supabase-js@2";

const KAPITAL_BASE = Deno.env.get("KAPITAL_BASE_URL") ?? "https://txpgtst.kapitalbank.az/api";
const KAPITAL_USER = Deno.env.get("KAPITAL_USERNAME") ?? "";
const KAPITAL_PASS = Deno.env.get("KAPITAL_PASSWORD") ?? "";
const CURRENCY = Deno.env.get("KAPITAL_CURRENCY") ?? "AZN";
const CALLBACK_URL = Deno.env.get("KAPITAL_CALLBACK_URL") ?? "";

/** Top-ups are the one amount a client names, so they get bounds. */
const TOPUP_MIN = 1;
const TOPUP_MAX = 500;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Create an order at the bank and get back the hosted-payment-page URL.
 *
 * Amounts go over the wire as strings ("42.00"): the API is documented that
 * way and a float would be reformatted unpredictably.
 */
async function createBankOrder(amount: number, reference: string, description: string) {
  const res = await fetch(`${KAPITAL_BASE}/order`, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(`${KAPITAL_USER}:${KAPITAL_PASS}`),
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      order: {
        typeRid: "Order_SMS",
        amount: amount.toFixed(2),
        currency: CURRENCY,
        language: "az",
        title: reference,
        description,
        initiationEnvKind: "Browser",
        hppRedirectUrl: CALLBACK_URL,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Kapital create-order failed: ${res.status}`);
  }

  const body = await res.json();
  const order = body?.order;

  if (!order?.id || !order?.password || !order?.hppUrl) {
    throw new Error("Kapital returned no usable order (missing id/password/hppUrl)");
  }

  return {
    id: String(order.id),
    password: String(order.password),
    hppUrl: String(order.hppUrl),
    status: String(order.status ?? "Preparing"),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  if (!KAPITAL_USER || !KAPITAL_PASS || !CALLBACK_URL) {
    // Loud rather than a mysterious bank error later.
    return json({ error: "payments_not_configured" }, 500);
  }

  // Two clients on purpose. The caller's token is used to establish WHO this
  // is — auth.uid() under their own RLS — and the service role is used only to
  // write the payment rows, which no client may write directly.
  const authHeader = req.headers.get("Authorization") ?? "";
  const asUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const asService = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: { user }, error: authError } = await asUser.auth.getUser();
  if (authError || !user) {
    return json({ error: "unauthorised" }, 401);
  }

  let payload: { action?: string; order_id?: string; amount?: number };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  try {
    if (payload.action === "order") {
      if (!payload.order_id) return json({ error: "order_id_required" }, 400);

      // Read the amount from OUR row, filtered by the caller's own id. This
      // both prices the payment and proves the order is theirs.
      const { data: order, error } = await asUser
        .from("orders")
        .select("id, total, order_no, payment_status")
        .eq("id", payload.order_id)
        .single();

      if (error || !order) return json({ error: "order_not_found" }, 404);
      if (order.payment_status === "paid") return json({ error: "already_paid" }, 409);

      const amount = Number(order.total);
      if (!(amount > 0)) return json({ error: "nothing_to_pay" }, 400);

      const bank = await createBankOrder(
        amount,
        `NATA-${order.order_no}`,
        `Nata Laundry order #${order.order_no}`,
      );

      await asService.from("payments").insert({
        order_id: order.id,
        amount,
        status: "pending",
        payment_method: "card",
        transaction_ref: bank.id,
      });

      return json({
        data: {
          hpp_url: `${bank.hppUrl}?id=${bank.id}&password=${bank.password}`,
          transaction_ref: bank.id,
          amount,
        },
      });
    }

    if (payload.action === "topup") {
      const amount = Number(payload.amount);
      if (!(amount >= TOPUP_MIN && amount <= TOPUP_MAX)) {
        return json({ error: "amount_out_of_range", min: TOPUP_MIN, max: TOPUP_MAX }, 400);
      }

      // Round to whole qəpik: the bank takes two decimals and a client could
      // otherwise send 1.005 and argue about the rounding afterwards.
      const rounded = Math.round(amount * 100) / 100;

      const { data: topup, error } = await asService
        .from("wallet_topups")
        .insert({ user_id: user.id, amount: rounded, status: "pending", payment_method: "card" })
        .select("id")
        .single();

      if (error || !topup) return json({ error: "could_not_start_topup" }, 500);

      const bank = await createBankOrder(
        rounded,
        `NATA-TOPUP-${topup.id.slice(0, 8)}`,
        "Nata Balance top-up",
      );

      await asService
        .from("wallet_topups")
        .update({ transaction_ref: bank.id })
        .eq("id", topup.id);

      return json({
        data: {
          topup_id: topup.id,
          hpp_url: `${bank.hppUrl}?id=${bank.id}&password=${bank.password}`,
          transaction_ref: bank.id,
          amount: rounded,
        },
      });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error("payments failed", e instanceof Error ? e.message : e);
    return json({ error: "payment_start_failed" }, 502);
  }
});
