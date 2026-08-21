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
  userId: string;
  lines: { serviceId: string; itemId: string; name: string; price: number; quantity: number }[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  tier: string;
  collectionTime: string;
  deliveryTime: string;
  address: string;
  addressLat: number | null;
  addressLng: number | null;
  notes: string | null;
  isOutsideCity: boolean;
  photos: string[];
};

/**
 * Writes the order plus its line items. Column names match the confirmed
 * schema; `collection_time` / `delivery_time` are free-text slot labels in
 * the database (e.g. "Sabah, 18:00 - 20:00"), which is how the shipped app
 * stores them.
 *
 * The server (Laravel) recomputes pricing on its own before accepting an
 * order — the figures sent here are what the customer was shown, not the
 * authority.
 */
export async function createOrder(input: NewOrderInput) {
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      user_id: input.userId,
      status: "pending" satisfies OrderStatus,
      delivery_tier: input.tier,
      service_type: input.lines[0]?.serviceId ?? "dry_cleaning",
      subtotal: input.subtotal,
      discount: input.discount,
      delivery_fee: input.deliveryFee,
      total: input.total,
      collection_time: input.collectionTime,
      delivery_time: input.deliveryTime,
      address: input.address,
      address_lat: input.addressLat,
      address_lng: input.addressLng,
      notes: input.notes,
      is_outside_city: input.isOutsideCity,
      item_photos: input.photos,
    })
    .select()
    .single();
  if (orderError) throw orderError;

  if (input.lines.length > 0) {
    const { error: itemsError } = await supabase.from("order_items").insert(
      input.lines.map((line) => ({
        order_id: order.id,
        service_id: line.serviceId,
        item_id: line.itemId,
        item_name: line.name,
        price: line.price,
        quantity: line.quantity,
      }))
    );
    if (itemsError) throw itemsError;
  }

  return order as Order;
}


type NewTopluOrderInput = {
  userId: string;
  deposit: number;
  collectionTime: string;
  deliveryTime: string;
  address: string;
  addressLat: number | null;
  addressLng: number | null;
  notes: string | null;
  isOutsideCity: boolean;
};

/**
 * Creates a "toplu" (bulk) order — no line items, because nothing has been
 * counted yet. `deposit_amount` holds what was paid up front and `total`
 * mirrors it, since that is genuinely all the customer owes at this point.
 * `counted_total` stays null until a courier records the count.
 */
export async function createTopluOrder(input: NewTopluOrderInput) {
  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      user_id: input.userId,
      status: "pending" satisfies OrderStatus,
      service_type: "toplu",
      delivery_tier: "standard",
      subtotal: 0,
      discount: 0,
      delivery_fee: 0,
      total: input.deposit,
      deposit_amount: input.deposit,
      collection_time: input.collectionTime,
      delivery_time: input.deliveryTime,
      address: input.address,
      address_lat: input.addressLat,
      address_lng: input.addressLng,
      notes: input.notes,
      is_outside_city: input.isOutsideCity,
      item_photos: [],
      payment_method: "deposit",
      payment_status: "deposit_paid",
    })
    .select()
    .single();
  if (error) throw error;
  return order as Order;
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
