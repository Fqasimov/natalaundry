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
  address: string;
  addressLat: number | null;
  addressLng: number | null;
  collectionTime: string;
  deliveryTime: string;
  notes: string | null;
  items: { itemId: string; serviceId: string; itemName: string; price: number; quantity: number }[];
};

export async function createOrder(input: NewOrderInput) {
  const subtotal = input.items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const deliveryFee = 0;
  const discount = 0;
  const total = subtotal + deliveryFee - discount;

  // "Users can insert their own orders" requires auth.uid() = user_id.
  // collection_time/delivery_time/subtotal/total are NOT NULL in the schema.
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      user_id: input.userId,
      status: "pending" satisfies OrderStatus,
      delivery_tier: "standard",
      service_type: "standard",
      subtotal,
      discount,
      delivery_fee: deliveryFee,
      total,
      collection_time: input.collectionTime,
      delivery_time: input.deliveryTime,
      address: input.address,
      address_lat: input.addressLat,
      address_lng: input.addressLng,
      notes: input.notes,
    })
    .select()
    .single();
  if (orderError) throw orderError;

  if (input.items.length > 0) {
    // "Users can insert their own order items" requires the parent order to
    // belong to auth.uid() — satisfied since we just created it as this user.
    const { error: itemsError } = await supabase.from("order_items").insert(
      input.items.map((item) => ({
        order_id: order.id,
        service_id: item.serviceId,
        item_id: item.itemId,
        item_name: item.itemName,
        price: item.price,
        quantity: item.quantity,
      }))
    );
    if (itemsError) throw itemsError;
  }

  return order as Order;
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
