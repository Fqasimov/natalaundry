import type { Order } from "@/types/database";

/**
 * What a courier has done, derived from their delivered orders.
 *
 * PROVISIONAL EARNINGS. The business has not decided how couriers are paid —
 * there is no payout table, no commission rate, nothing in backend/config
 * about it — so the figure shown is the order's own `delivery_fee`, which is
 * real data already on every order rather than an invented number. It is a
 * placeholder for the layout, not a statement about anyone's wages.
 *
 * When the rule is settled, change `earningFor` and nothing else: the screen,
 * the totals and the per-job rows all read through it. Likely candidates are a
 * percentage of `total`, a flat amount per job, or exactly what is here.
 */
export const EARNINGS_ARE_PROVISIONAL = true;

export function earningFor(order: Order): number {
  return Number(order.delivery_fee ?? 0);
}

/** Cash the courier physically collected — a fact, not a policy. */
export function cashCollectedFor(order: Order): number {
  return order.payment_method === "cash" ? Number(order.total ?? 0) : 0;
}

export type CourierStats = {
  jobsAllTime: number;
  jobsToday: number;
  jobsThisWeek: number;
  earningsAllTime: number;
  earningsThisWeek: number;
  cashCollectedAllTime: number;
};

const startOfToday = (now: Date) =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate());

/** Monday, because the working week here starts on one. */
const startOfWeek = (now: Date) => {
  const d = startOfToday(now);
  const weekday = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - weekday);
  return d;
};

export function summarise(orders: Order[], now: Date = new Date()): CourierStats {
  const today = startOfToday(now).getTime();
  const week = startOfWeek(now).getTime();

  const stats: CourierStats = {
    jobsAllTime: 0,
    jobsToday: 0,
    jobsThisWeek: 0,
    earningsAllTime: 0,
    earningsThisWeek: 0,
    cashCollectedAllTime: 0,
  };

  for (const order of orders) {
    // delivered_at can be null on rows that reached 'delivered' through the
    // legacy path, which never stamped it. Fall back to created_at so the job
    // still counts rather than silently vanishing from the totals.
    const stamp = order.delivered_at ?? order.created_at;
    const at = stamp ? new Date(stamp).getTime() : NaN;

    stats.jobsAllTime += 1;
    stats.earningsAllTime += earningFor(order);
    stats.cashCollectedAllTime += cashCollectedFor(order);

    if (!Number.isNaN(at)) {
      if (at >= today) stats.jobsToday += 1;
      if (at >= week) {
        stats.jobsThisWeek += 1;
        stats.earningsThisWeek += earningFor(order);
      }
    }
  }

  return stats;
}
