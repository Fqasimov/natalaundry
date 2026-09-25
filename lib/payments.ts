import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";

/**
 * Paying for an order.
 *
 * Card and wallet payments run through Kapital Bank's hosted payment page.
 * The app never sees a card number: it opens the bank's page in the system
 * browser, the bank redirects to the `payments-callback` Edge Function, and
 * that callback — not this file — decides whether the order is paid, by asking
 * the bank directly with credentials no phone ever holds.
 *
 * No amount is ever sent from here. The server charges what it priced the
 * order at, for the same reason order creation re-prices the basket.
 */

/** Mirrors App\Support\PaymentMethod. */
export const PAYMENT_METHODS = [
  "card",
  // Nata Balance. Settles entirely in-house — no gateway, no redirect — by
  // debiting the customer's own wallet inside one locked transaction.
  "balance",
  "cash",
  "apple_pay",
  "google_pay",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Mirrors the values PaymentService writes to orders.payment_status. */
export type PaymentStatus =
  | "pending"
  | "paid"
  | "authorized"
  | "partially_paid"
  | "failed"
  | "cancelled"
  | "expired"
  | "refunded"
  | "partially_refunded"
  | "amount_mismatch"
  | "unconfirmed";

/** A payment that finished, one way or another — nothing left to wait for. */
export function isSettled(status: PaymentStatus | string | null | undefined): boolean {
  return status === "paid" || status === "refunded" || status === "partially_refunded";
}

export type PaymentOptions = {
  methods: PaymentMethod[];
  wallets_enabled: boolean;
  /** Offered, but greyed out and not selectable. See CARD_PAYMENTS_ENABLED. */
  unavailable: PaymentMethod[];
};

/**
 * Whether the bank gateway may be used at all.
 *
 * FALSE, deliberately, and this is the only place to change it.
 *
 * KAPITAL_BASE_URL points at `txpgtst.kapitalbank.az` — Kapital's **test**
 * gateway, with their public sandbox merchant. A card entered there is not
 * charged, and worse, the sandbox answers our callback with a success the
 * `payments-callback` function has no way to tell from a real one. So an
 * order would be marked paid, and a wallet top-up would credit real balance,
 * for money that never moved. Silent free money in one direction and a
 * customer who believes they have paid in the other.
 *
 * Cash is a first-class method here — 7 of the first 15 real orders were cash
 * — so the product works without the gateway. Card stays visible but disabled
 * rather than hidden: a customer who used card on the old build should see
 * that it is temporarily off, not be left wondering where it went.
 *
 * To turn card back on: get production credentials from Kapital, set
 * KAPITAL_BASE_URL to `https://e-commerce.kapitalbank.az/api` and the
 * callback URL to a public HTTPS address, verify a real payment of a small
 * amount end to end, and only then flip this to true. Flipping it first ships
 * a checkout that takes no money.
 */
export const CARD_PAYMENTS_ENABLED = false;

/**
 * Methods that ride on the bank gateway, and so are off whenever it is.
 *
 * Cash and `balance` are not here: cash never touches a gateway, and a
 * balance payment is an in-house debit inside one locked transaction
 * (`pay_order`), so it moves money that is already ours to move. A customer
 * with a balance can still spend it — they simply cannot add to it until the
 * gateway is live, since topping up is itself a card payment.
 */
export const GATEWAY_METHODS: readonly PaymentMethod[] = [
  "card",
  "apple_pay",
  "google_pay",
];

/** True when this method cannot be used right now. */
export function isMethodUnavailable(method: PaymentMethod): boolean {
  return !CARD_PAYMENTS_ENABLED && GATEWAY_METHODS.includes(method);
}

/**
 * Which methods checkout may offer.
 *
 * Card and cash always work. Wallets depend on the merchant terminal's
 * configuration at the bank, and there is no longer a server to ask — so they
 * stay off until someone turns them on deliberately, which is the safe
 * default: offering Apple Pay on a terminal that does not accept it is a dead
 * end the customer discovers at the bank's page.
 */
export async function fetchPaymentOptions(): Promise<PaymentOptions> {
  return {
    methods: ["card", "cash", "balance"],
    wallets_enabled: false,
    unavailable: (["card", "cash", "balance"] as PaymentMethod[]).filter(isMethodUnavailable),
  };
}

/**
 * The wallet that makes sense on this device.
 *
 * Apple Pay never appears on Android and Google Pay never on iOS — offering
 * the wrong one is a dead end, since the wallet only exists on its own
 * platform.
 */
export function walletForPlatform(): PaymentMethod | null {
  if (Platform.OS === "ios") return "apple_pay";
  if (Platform.OS === "android") return "google_pay";
  return null;
}

type StartResult = {
  method: PaymentMethod;
  redirect_url: string | null;
  payment_id: string;
  bank_order_id: string | null;
};

type PaymentState = {
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  bank_status: string | null;
  /** True when the gateway could not be reached and this is the last known state. */
  stale?: boolean;
};

/**
 * Current payment state.
 *
 * Read from our own row, not asked of the bank. The `payments-callback` Edge
 * Function is what talks to Kapital: it verifies the payment with our own
 * credentials and settles the row. So this watches for that settlement to
 * land, which is why waitForSettlement below polls rather than reading once.
 */
export async function fetchPaymentState(orderId: string): Promise<PaymentState> {
  const { data, error } = await supabase
    .from("orders")
    .select("payment_status, payment_method")
    .eq("id", orderId)
    .single();

  if (error) throw error;

  return {
    payment_status: (data?.payment_status ?? "pending") as PaymentStatus,
    payment_method: (data?.payment_method ?? null) as PaymentMethod | null,
    bank_status: null,
  };
}

/**
 * Pays for an order, and resolves once the outcome is known.
 *
 * Cash settles immediately — there is nothing to collect until delivery.
 *
 * Card and wallet open the bank's page in an auth session. Two things can end
 * that session: the bank redirecting back to our scheme, or the customer
 * dismissing it. Neither is trusted as an outcome. In both cases the real
 * status is fetched from the server afterwards, because a customer who paid
 * and then swiped the browser away has still paid, and one who reached a
 * page saying "success" may not have.
 */
export async function payForOrder(
  orderId: string,
  method: PaymentMethod,
  language: string = "az",
): Promise<PaymentState> {
  // Cash and Nata Balance never leave the app, and never leave the database
  // either: pay_order settles both, so the customer never writes
  // payment_status themselves.
  if (method === "cash" || method === "balance") {
    const { data, error } = await supabase.rpc("pay_order", {
      p_order: orderId,
      p_method: method,
    });
    if (error) throw error;

    // pay_order returns the state it just wrote, so reading the row back is a
    // second round trip for an answer already in hand. Fall back to the read
    // only if the shape is not what we expect.
    const settled = data as { payment_status?: string; payment_method?: string } | null;
    if (settled?.payment_status) {
      return {
        payment_status: settled.payment_status as PaymentStatus,
        payment_method: (settled.payment_method ?? method) as PaymentMethod,
        bank_status: null,
      };
    }
    return fetchPaymentState(orderId);
  }

  // A disabled method must not be reachable by any path — a stale screen, a
  // resumed checkout, a future caller. The picker greys it out; this refuses
  // it. A UI-only guard is not a guard.
  if (isMethodUnavailable(method)) throw new Error("payment_method_unavailable");

  // Card goes through the Edge Function: it holds the bank credentials, reads
  // the amount from `orders.total` rather than taking one from here, and gives
  // the bank a public URL to send the customer back to.
  const { data, error } = await supabase.functions.invoke<{ data: StartResult & { hpp_url: string } }>(
    "payments",
    { body: { action: "order", order_id: orderId, language } },
  );

  if (error) throw error;

  const redirectUrl = data?.data?.hpp_url;
  if (!redirectUrl) return fetchPaymentState(orderId);

  try {
    await WebBrowser.openAuthSessionAsync(redirectUrl, "natalaundry://payment");
  } catch {
    // The browser failing to open tells us nothing about the payment, and on
    // some devices it closes in a way that throws. Fall through to the
    // server, which is the only thing that actually knows.
  }

  return fetchPaymentState(orderId);
}

/**
 * Polls until the payment settles or the attempts run out.
 *
 * 3-D Secure can leave a payment briefly in flight after the customer is
 * redirected back, so a single check right after the browser closes can read
 * 'pending' on a payment that is about to succeed. Backs off between tries
 * and gives up rather than spinning — an unsettled payment is shown as
 * pending, not as failed.
 */
export async function waitForSettlement(
  orderId: string,
  { attempts = 5, delayMs = 1500 }: { attempts?: number; delayMs?: number } = {},
): Promise<PaymentState> {
  let state = await fetchPaymentState(orderId);

  for (let i = 1; i < attempts && state.payment_status === "pending"; i++) {
    await new Promise((resolve) => setTimeout(resolve, delayMs * i));
    state = await fetchPaymentState(orderId);
  }

  return state;
}
