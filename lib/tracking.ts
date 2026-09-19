import { supabase } from "./supabase";
import { isActive, isTracking, type LifecycleState } from "./lifecycle";
import type { CourierLocation, Order, OrderStatusLog } from "@/types/database";

/**
 * Order tracking, read straight from Postgres through Supabase.
 *
 * Deliberately polling rather than a paid live-tracking product: the courier
 * writes a `courier_locations` row every few seconds while en route and the
 * customer reads the newest one.
 */

/** How often the customer asks for a fresh fix, in ms. */
export const TRACK_POLL_MS = 5000;

/** A fix older than this is shown as "waiting for signal" rather than stale. */
export const TRACK_STALE_MS = 60_000;

/** The customer's current order, if any — the one the home screen shows. */
/**
 * Every order this customer currently has in flight, newest first.
 *
 * There was only ever a `limit(1)` here, so a customer with two live orders
 * saw one of them on the home screen and had no indication the other existed.
 * Placing a second order appeared to replace the first.
 *
 * Capped rather than unbounded: the home screen shows these as swipeable
 * cards, and a customer with more than a handful is better served by the
 * orders tab than by a carousel they have to page through.
 */
export async function fetchActiveOrders(userId: string, limit = 10): Promise<Order[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", userId)
    .not("lifecycle_state", "in", '("delivered","cancelled")')
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  // Guard in case the filter is unavailable (older rows have a null
  // lifecycle_state): fall back to checking on the client.
  return ((data ?? []) as Order[]).filter((o) => isActive(o.lifecycle_state));
}

/** The most recent in-flight order, or null. Kept for callers that want one. */
export async function fetchActiveOrder(userId: string): Promise<Order | null> {
  const rows = await fetchActiveOrders(userId, 1);
  return rows[0] ?? null;
}

/** Has this customer ever ordered? Drives the first-order promo card. */
export async function hasAnyOrder(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("orders")
    .select("id")
    .eq("user_id", userId)
    .neq("status", "cancelled")
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function fetchOrderTimeline(orderId: string): Promise<OrderStatusLog[]> {
  const { data, error } = await supabase
    .from("order_status_logs")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as OrderStatusLog[];
}

/** The newest position fix for an order, or null if none yet. */
export async function fetchLatestLocation(orderId: string): Promise<CourierLocation | null> {
  const { data, error } = await supabase
    .from("courier_locations")
    .select("*")
    .eq("order_id", orderId)
    .order("recorded_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return ((data ?? []) as CourierLocation[])[0] ?? null;
}

/**
 * Courier side: push one fix.
 *
 * Written straight to the table. The two checks the API used to make are now
 * in the RLS policy, which is a better place for them: the row must name the
 * caller as its courier, and the order must be one they are assigned to AND in
 * an en-route state. So a loop that failed to stop cannot keep writing rows
 * after delivery, and one courier cannot write positions onto another's job.
 */
export async function pushLocation(input: {
  orderId: string;
  courierId: string;
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
}): Promise<void> {
  const { error } = await supabase.from("courier_locations").insert({
    order_id: input.orderId,
    courier_id: input.courierId,
    lat: input.lat,
    lng: input.lng,
    heading: input.heading ?? null,
    speed: input.speed ?? null,
    accuracy: input.accuracy ?? null,
    recorded_at: new Date().toISOString(),
  });

  if (!error) return;

  // 42501 is the policy refusing the row, which happens when the order left
  // the en-route states while a ping was in flight. That is the loop being
  // right on time, not an error worth surfacing to a courier who is driving.
  if (error.code === "42501") return;

  throw error;
}

export function isFixStale(location: CourierLocation | null): boolean {
  if (!location?.recorded_at) return true;
  return Date.now() - new Date(location.recorded_at).getTime() > TRACK_STALE_MS;
}

/** Should the map be live for this order right now? */
export function shouldPoll(state: LifecycleState | null | undefined): boolean {
  return isTracking(state);
}
