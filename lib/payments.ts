import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { apiPost, apiRequest } from "@/lib/api";

/**
 * Paying for an order.
 *
 * Card and wallet payments run through Kapital Bank's hosted payment page.
 * The app never sees a card number: it opens the bank's page in the system
 * browser, the bank redirects to our API's callback, and that callback — not
 * this file — decides whether the order is paid, by asking the bank directly.
 *
 * No amount is ever sent from here. The server charges what it priced the
 * order at, for the same reason order creation re-prices the basket.
 */

/** Mirrors App\Support\PaymentMethod. */
export const PAYMENT_METHODS = ["card", "cash", "apple_pay", "google_pay"] as const;
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
};

/**
 * Which methods checkout may offer.
 *
 * Asked of the server rather than hardcoded: whether wallets appear depends
 * on the merchant terminal's configuration at the bank, which only the
 * backend knows. See config/kapital.php.
 */
export async function fetchPaymentOptions(): Promise<PaymentOptions> {
  const { data } = await apiRequest<{ data: PaymentOptions }>("payments/methods");
  return data;
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

/** Current payment state, re-checked against the bank server-side. */
export async function fetchPaymentState(orderId: string): Promise<PaymentState> {
  const { data } = await apiRequest<{ data: PaymentState }>(`orders/${orderId}/payment`);
  return data;
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
  const { data } = await apiPost<{ data: StartResult }>(`orders/${orderId}/pay`, {
    method,
    language,
  });

  if (method === "cash" || !data.redirect_url) {
    return fetchPaymentState(orderId);
  }

  try {
    await WebBrowser.openAuthSessionAsync(data.redirect_url, "natalaundry://payment");
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
