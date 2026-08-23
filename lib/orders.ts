import { ApiError, apiPost } from "@/lib/api";
import { supabase } from "./supabase";
import type { Order, OrderItem, OrderStatus } from "@/types/database";

// Queries here match the confirmed schema (information_schema dump,
// 2026-08-20) and the RLS policies pulled earlier — the claim/advance/cancel
// transitions below only work because they mirror those policies exactly.
//
// `service_prices` real columns are still unconfirmed (see lib/catalog.ts) —
// booking currently uses the static catalog instead of that table.

export async function fetchMyOrders() {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Order[];
}

export async function fetchOrder(orderId: string) {
  const { data, error } = await supabase.from("orders").select("*").eq("id", orderId).single();
  if (error) throw error;
  return data as Order;
}

export async function fetchOrderItems(orderId: string) {
  const { data, error } = await supabase.from("order_items").select("*").eq("order_id", orderId);
  if (error) throw error;
  return data as OrderItem[];
}

/**
 * The most recent completed order, used by "repeat last order" on the profile
 * screen. Toplu orders are excluded: they carry no line items to rebuild a
 * basket from — the courier sets the total after counting.
 */
export async function fetchLastCompletedOrder() {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("status", "completed" satisfies OrderStatus)
    .neq("service_type", "toplu")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data as Order[])[0] ?? null;
}

// "Couriers can view pending orders" — jobs nobody has claimed yet.
export async function fetchAvailableOrdersForCourier() {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as Order[];
}

// "Couriers can view assigned orders" — jobs already claimed by this courier.
export async function fetchMyCourierOrders(courierId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("courier_id", courierId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Order[];
}

type NewOrderInput = {
  lines: { serviceId: string; itemId: string; name: string; price: number; quantity: number }[];
  tier: string;
  collectionTime: string;
  deliveryTime: string;
  address: string;
  addressLat: number | null;
  addressLng: number | null;
  notes: string | null;
  isOutsideCity: boolean;
  photos: string[];
  promoCode: string | null;
};

/**
 * Creates an order through the API rather than by writing the table.
 *
 * Only the item ids and quantities are sent. The subtotal, the delivery fee,
 * any promo discount and the total are all decided by the server from its own
 * catalogue — the figures on the summary screen are what the customer was
 * shown, never the authority. Writing `orders` directly from here would mean
 * accepting whatever total a modified client chose to send, and would skip the
 * automatic first-order discount, which is applied server-side.
 *
 * The owner comes from the access token, so an order cannot be filed against
 * someone else's account either.
 */
export async function createOrder(input: NewOrderInput) {
  const { data } = await apiPost<{ data: Order }>("orders", {
    items: input.lines.map((line) => ({
      service_id: line.serviceId,
      item_id: line.itemId,
      quantity: line.quantity,
    })),
    delivery_tier: input.tier,
    collection_time: input.collectionTime,
    delivery_time: input.deliveryTime,
    address: input.address,
    address_lat: input.addressLat,
    address_lng: input.addressLng,
    notes: input.notes,
    is_outside_city: input.isOutsideCity,
    item_photos: input.photos,
    promo_code: input.promoCode,
  });

  return data;
}


type NewTopluOrderInput = {
  collectionTime: string;
  deliveryTime: string;
  address: string;
  addressLat: number | null;
  addressLng: number | null;
  notes: string | null;
  isOutsideCity: boolean;
};

/**
 * Creates a "toplu" (bulk) order. The deposit is not sent: it is a published
 * price, so the server sets it, exactly as it sets the total for a normal
 * order. `counted_total` stays null until a courier records the count.
 */
export async function createTopluOrder(input: NewTopluOrderInput) {
  const { data } = await apiPost<{ data: Order }>("orders/bulk", {
    collection_time: input.collectionTime,
    delivery_time: input.deliveryTime,
    address: input.address,
    address_lat: input.addressLat,
    address_lng: input.addressLng,
    notes: input.notes,
    is_outside_city: input.isOutsideCity,
  });

  return data;
}

/**
 * Courier records the counted value of a bulk load.
 *
 * This is the price of the order, so it goes through the API: the server
 * checks that the caller is the assigned courier, that the order is actually a
 * bulk one at a stage where counting makes sense, and that the figure is in
 * range. RLS can say "the assigned courier may update this row"; it cannot say
 * what a sane value for it is.
 */
export async function recordTopluCount(
  orderId: string,
  _courierId: string,
  countedTotal: number
) {
  await apiPost(`orders/${orderId}/count`, { counted_total: countedTotal });
}

/**
 * Courier: orders broadcast to me and still unclaimed.
 *
 * The pool is the source of truth — an order offered to named couriers must
 * not appear for anyone else — so this reads courier_assignments rather than
 * scanning every pending order.
 */
export async function fetchOfferedOrders(courierId: string) {
  const { data: offers, error: offerError } = await supabase
    .from("courier_assignments")
    .select("order_id")
    .eq("courier_id", courierId)
    .is("claimed_at", null);
  if (offerError) throw offerError;

  const ids = (offers ?? []).map((o: { order_id: string }) => o.order_id);
  if (ids.length === 0) return [] as Order[];

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .in("id", ids)
    .eq("lifecycle_state", "assigning_couriers")
    .is("courier_id", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Order[];
}

/** Courier: the job I am currently working, if any. */
export async function fetchMyActiveJob(courierId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("courier_id", courierId)
    .not("lifecycle_state", "in", '("delivered","cancelled")')
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return ((data ?? []) as Order[])[0] ?? null;
}

/**
 * Claim a broadcast order. First-to-claim wins, decided by the database:
 * the update is conditional on courier_id still being null, so a courier who
 * loses the race updates zero rows and is told so rather than overwriting the
 * winner. The Laravel endpoint takes a row lock for the same reason; this is
 * the same guarantee expressed as a conditional write.
 *
 * @returns true when this courier won the race.
 */
export async function claimOrderAtomically(orderId: string, _courierId: string): Promise<boolean> {
  try {
    await apiPost(`orders/${orderId}/lifecycle/claim`);
    return true;
  } catch (e) {
    // 409 is the ordinary outcome of losing the race, not a failure worth
    // surfacing as an error. Anything else is.
    if (e instanceof ApiError && e.status === 409) return false;
    throw e;
  }
}

/**
 * Move an order to an explicit next lifecycle state.
 *
 * Conditional on the current state so a double-tap can't skip a step: the
 * second write matches no rows. `status` is kept in step with the same mapping
 * the server uses, so the legacy column never drifts.
 */
export async function transitionOrder(
  orderId: string,
  _from: string,
  to: string
): Promise<boolean> {
  try {
    await apiPost(`orders/${orderId}/lifecycle/transition`, { to });
    return true;
  } catch (e) {
    // 422 is the state machine refusing the move — a double-tap, or a step
    // this actor may not take. The caller reloads and shows the real state.
    if (e instanceof ApiError && e.status === 422) return false;
    throw e;
  }
}

/**
 * Distinct addresses this customer has had orders collected from, newest
 * first. There is no addresses table in the confirmed schema, so the useful
 * list is derived from order history rather than invented.
 */
export async function fetchRecentAddresses(userId: string, limit = 8): Promise<string[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("address, created_at")
    .eq("user_id", userId)
    .not("address", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;

  const seen = new Set<string>();
  for (const row of (data ?? []) as { address: string | null }[]) {
    const address = row.address?.trim();
    if (address) seen.add(address);
    if (seen.size >= limit) break;
  }
  return [...seen];
}

/**
 * Cancel an order. The server decides whether it is still cancellable —
 * a customer must not be able to cancel a load a courier already collected.
 */
export async function cancelOrder(orderId: string) {
  await apiPost(`orders/${orderId}/cancel`);
}

/**
 * Claim a pending, unassigned order (the pre-lifecycle path still used by the
 * order detail screen). The race is settled by a row lock on the server, so
 * two couriers tapping at once produce one winner and one 409.
 */
export async function claimOrder(orderId: string, _courierId: string) {
  await apiPost(`orders/${orderId}/claim`);
}

/**
 * Advance the job one step.
 *
 * The step itself is chosen by the server from the order's current state, and
 * it checks the caller is the assigned courier first. The previous version
 * wrote the status column directly with no condition beyond the order id, so
 * any caller RLS let through could mark any order delivered.
 */
export async function advanceOrderStatus(orderId: string, _currentStatus: OrderStatus) {
  const { data } = await apiPost<{ data: Order }>(`orders/${orderId}/advance`);
  return data.status;
}
