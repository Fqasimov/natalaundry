import type { Order } from "@/types/database";

/**
 * "Toplu" — the bulk / count-after-pickup order type.
 *
 * Unlike the itemised services, the customer never picks items up front.
 * They pay a fixed deposit, the courier collects and counts the load, and
 * the real order value is written back to `orders.counted_total`.
 *
 * This maps onto columns that already exist in the live schema —
 * `deposit_amount`, `counted_total`, `counted_at`, `counted_by` — which
 * strongly suggests the original app was built around the same flow.
 *
 * The server recomputes the deposit at checkout; this constant only drives
 * what the app displays.
 */
export const TOPLU_DEPOSIT = 20;

/** The courier must collect within this window of the order being placed. */
export const TOPLU_PICKUP_WINDOW_HOURS = 24;

export const TOPLU_SERVICE_TYPE = "toplu";

export function isToplu(order: Pick<Order, "service_type">) {
  return order.service_type === TOPLU_SERVICE_TYPE;
}

export type TopluSettlement = {
  /** Fixed amount taken up front. */
  deposit: number;
  /** Whatever the courier counted, or null while still awaiting pickup. */
  countedTotal: number | null;
  counted: boolean;
  /** Still owed once counted; 0 when the deposit already covers it. */
  balanceDue: number;
  /** Refunded to the wallet when the count came in under the deposit. */
  refund: number;
};

/**
 * Splits a counted bulk order into what's still owed versus what comes back.
 * Before the count lands both sides are zero — nothing is settled yet.
 */
export function settleToplu(order: Order): TopluSettlement {
  const deposit = Number(order.deposit_amount ?? 0);
  const raw = order.counted_total;
  const countedTotal = raw === null || raw === undefined ? null : Number(raw);

  if (countedTotal === null) {
    return { deposit, countedTotal: null, counted: false, balanceDue: 0, refund: 0 };
  }

  const difference = countedTotal - deposit;
  return {
    deposit,
    countedTotal,
    counted: true,
    balanceDue: difference > 0 ? Number(difference.toFixed(2)) : 0,
    refund: difference < 0 ? Number(Math.abs(difference).toFixed(2)) : 0,
  };
}
