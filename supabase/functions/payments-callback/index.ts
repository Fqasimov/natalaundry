// Where the bank sends the customer back to.
//
// Runs with verify_jwt disabled, because the caller is Kapital's redirect and a
// browser following it — neither carries a Supabase token. That makes the
// authentication rule here the important part:
//
//   Nothing in the query string is trusted.
//
// The redirect carries a STATUS parameter. It is a hint for the UI and nothing
// more: anyone can open this URL with STATUS=FullyPaid. The only thing that
// decides whether money moved is asking the bank directly about the order id,
// with our own credentials, and reading its answer.
//
// Then it redirects into the app via the natalaundry:// scheme so the customer
// lands back where they were.

const KAPITAL_BASE = Deno.env.get("KAPITAL_BASE_URL") ?? "https://txpgtst.kapitalbank.az/api";
const KAPITAL_USER = Deno.env.get("KAPITAL_USERNAME") ?? "";
const KAPITAL_PASS = Deno.env.get("KAPITAL_PASSWORD") ?? "";
const APP_SCHEME = Deno.env.get("KAPITAL_APP_RETURN_SCHEME") ?? "natalaundry";

/** The bank's vocabulary, mapped to ours. Lifted from config/kapital.php. */
const STATUS_MAP: Record<string, string> = {
  FullyPaid: "paid",
  Refunded: "refunded",
  PartiallyRefunded: "partially_refunded",
  Declined: "failed",
  Rejected: "failed",
  Cancelled: "cancelled",
  Expired: "expired",
  Preparing: "pending",
  Authorized: "authorized",
  PartiallyPaid: "partially_paid",
  Voided: "cancelled",
};

/** Ask the bank what really happened. This is the only source of truth. */
async function fetchBankOrder(bankOrderId: string) {
  const res = await fetch(`${KAPITAL_BASE}/order/${encodeURIComponent(bankOrderId)}`, {
    headers: {
      "Authorization": "Basic " + btoa(`${KAPITAL_USER}:${KAPITAL_PASS}`),
      "Accept": "application/json",
    },
  });
  if (!res.ok) throw new Error(`Kapital get-order failed: ${res.status}`);
  const body = await res.json();
  return body?.order ?? null;
}

const backToApp = (path: string) =>
  new Response(null, { status: 302, headers: { Location: `${APP_SCHEME}://${path}` } });

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const bankOrderId = url.searchParams.get("ID") ?? url.searchParams.get("id");

  if (!bankOrderId) {
    return backToApp("payment/failed?reason=missing_id");
  }

  if (!KAPITAL_USER || !KAPITAL_PASS) {
    console.error("payments-callback is not configured");
    return backToApp("payment/failed?reason=not_configured");
  }

  try {
    const order = await fetchBankOrder(bankOrderId);
    if (!order) return backToApp("payment/failed?reason=unknown_order");

    const status = STATUS_MAP[String(order.status ?? "")] ?? "pending";
    const paid = status === "paid";

    // settle_bank_order decides what the reference means: paying for an order,
    // topping up the balance, or the 1.0.2 payment_intents path that is still
    // live for anyone who has not updated. Every branch filters on a
    // not-yet-settled state, so a browser reload or a repeated redirect lands
    // on "already settled" rather than crediting twice.
    //
    // Reached with the service role because it is revoked from anon and
    // authenticated — deliberately, since it moves money and takes nothing but
    // a reference.
    const rpc = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/settle_bank_order`,
      {
        method: "POST",
        headers: {
          "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_ref: bankOrderId, p_paid: paid }),
      },
    );

    if (!rpc.ok) {
      // The money is real either way; failing to record it is our problem, not
      // the customer's, so it is logged loudly and the customer is still told
      // the truth about the payment.
      console.error("settle_payment_intent failed", rpc.status, await rpc.text());
    }

    return backToApp(paid ? "payment/success" : `payment/failed?reason=${status}`);
  } catch (e) {
    console.error("callback failed", e instanceof Error ? e.message : e);
    return backToApp("payment/failed?reason=verification_failed");
  }
});
