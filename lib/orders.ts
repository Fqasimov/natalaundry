import { apiPost } from "@/lib/api";
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
 * Courier records the counted value of a bulk load. Scoped to the assigned
 * courier by the same RLS policy that guards every other courier update.
 */
export async function recordTopluCount(
  orderId: string,
  courierId: string,
  countedTotal: number
) {
  const { error } = await supabase
    .from("orders")
    .update({
      counted_total: countedTotal,
      counted_at: new Date().toISOString(),
      counted_by: courierId,
    })
    .eq("id", orderId)
    .eq("courier_id", courierId);
  if (error) throw error;
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
export async function claimOrderAtomically(orderId: string, courierId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("orders")
    .update({
      courier_id: courierId,
      lifecycle_state: "courier_assigned",
      status: "pending",
      assigned_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("lifecycle_state", "assigning_couriers")
    .is("courier_id", null)
    .select("id");
  if (error) throw error;

  const won = (data ?? []).length > 0;
  if (won) {
    await supabase
      .from("courier_assignments")
      .update({ claimed_at: new Date().toISOString() })
      .eq("order_id", orderId)
      .eq("courier_id", courierId);
  }
  return won;
}

/**
 * Move an order to an explicit next lifecycle state.
 *
 * Conditional on the current state so a double-tap can't skip a step: the
 * second write matches no rows. `status` is kept in step with the same mapping
 * the server uses, so the legacy column never drifts.
 */
const LEGACY_STATUS: Record<string, OrderStatus> = {
  order_placed: "pending",
  assigning_couriers: "pending",
  courier_assigned: "pending",
  courier_en_route_pickup: "collecting",
  picked_up: "collecting",
  at_laundry: "cleaning",
  processing_finished: "cleaning",
  courier_en_route_delivery: "delivering",
  delivered: "completed",
  cancelled: "cancelled",
};

const TIMESTAMP_COLUMN: Record<string, string | undefined> = {
  picked_up: "collected_at",
  at_laundry: "cleaning_started_at",
  processing_finished: "processing_finished_at",
  courier_en_route_delivery: "delivering_at",
  delivered: "delivered_at",
};

export async function transitionOrder(
  orderId: string,
  from: string,
  to: string
): Promise<boolean> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    lifecycle_state: to,
    status: LEGACY_STATUS[to] ?? "pending",
  };
  const stamp = TIMESTAMP_COLUMN[to];
  if (stamp) patch[stamp] = now;

  const { data, error } = await supabase
    .from("orders")
    .update(patch)
    .eq("id", orderId)
    .eq("lifecycle_state", from)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
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

// "Users can cancel their own pending orders." — only while still pending.
export async function cancelOrder(orderId: string) {
  const { error } = await supabase
    .from("orders")
    .update({ status: "cancelled" satisfies OrderStatus })
    .eq("id", orderId)
    .eq("status", "pending" satisfies OrderStatus);
  if (error) throw error;
}

// "Couriers can update orders" — claim a pending, unassigned order.
export async function claimOrder(orderId: string, courierId: string) {
  const { error } = await supabase
    .from("orders")
    .update({
      courier_id: courierId,
      status: "collecting" satisfies OrderStatus,
      assigned_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("status", "pending" satisfies OrderStatus)
    .is("courier_id", null);
  if (error) throw error;
}

const NEXT_STATUS: Partial<Record<OrderStatus, { status: OrderStatus; timestampColumns: string[] }>> = {
  // The schema has both collected_at and cleaning_started_at — we don't
  // model a separate "collected" state, so this one transition stamps both.
  collecting: { status: "cleaning", timestampColumns: ["collected_at", "cleaning_started_at"] },
  cleaning: { status: "delivering", timestampColumns: ["delivering_at"] },
  delivering: { status: "completed", timestampColumns: ["delivered_at"] },
};

// "Couriers update assigned orders" — advance the job one step, stamping the
// matching *_at timestamp column(s) the schema provides for each stage.
export async function advanceOrderStatus(orderId: string, currentStatus: OrderStatus) {
  const next = NEXT_STATUS[currentStatus];
  if (!next) throw new Error(`No next status after "${currentStatus}"`);
  const now = new Date().toISOString();
  const timestamps = Object.fromEntries(next.timestampColumns.map((col) => [col, now]));
  const { error } = await supabase
    .from("orders")
    .update({ status: next.status, ...timestamps })
    .eq("id", orderId);
  if (error) throw error;
  return next.status;
}
