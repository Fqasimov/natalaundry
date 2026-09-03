import { supabase } from "./supabase";
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

/**
 * Kilometres between two fixes, on a sphere.
 *
 * Good to a few metres at city scale, which is well inside the error the GPS
 * itself contributes.
 */
function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * How far this courier has travelled today, in kilometres.
 *
 * Walked from their own `courier_locations` breadcrumbs rather than asked of a
 * routing service. Three reasons: it is free where a routing call is metered,
 * it needs no origin to be invented, and it is what actually happened rather
 * than what a route planner would have suggested.
 *
 * Straight lines between consecutive fixes under-read a winding road, but the
 * tracker records every 25m of movement while en route, so the error is small.
 * A single jump over 5km is dropped: that is a GPS glitch or a gap while the
 * app was closed, not a courier teleporting.
 */
const IMPLAUSIBLE_JUMP_KM = 5;

export async function fetchDistanceTodayKm(courierId: string): Promise<number> {
  const since = startOfToday(new Date()).toISOString();

  const { data, error } = await supabase
    .from("courier_locations")
    .select("lat, lng, recorded_at, created_at")
    .eq("courier_id", courierId)
    .gte("recorded_at", since)
    .order("recorded_at", { ascending: true });

  if (error || !data || data.length < 2) return 0;

  let km = 0;
  for (let i = 1; i < data.length; i++) {
    const from = { lat: Number(data[i - 1].lat), lng: Number(data[i - 1].lng) };
    const to = { lat: Number(data[i].lat), lng: Number(data[i].lng) };
    if ([from.lat, from.lng, to.lat, to.lng].some((n) => Number.isNaN(n))) continue;

    const step = haversineKm(from, to);
    if (step <= IMPLAUSIBLE_JUMP_KM) km += step;
  }
  return km;
}

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
