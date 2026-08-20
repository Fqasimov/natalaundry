import { supabase } from "./supabase";
import type { Order, OrderItem, OrderStatus, ServicePrice } from "@/types/database";

// All queries here are shaped to match the recovered RLS policies exactly —
// e.g. couriers can only see 'pending' orders or ones they're already
// assigned/offered on; customers only ever see their own. Column names
// beyond id/user_id/courier_id/status are PROVISIONAL (see types/database.ts)
// and will need adjusting once the full schema dump is in.

export async function fetchActiveServicePrices() {
  const { data, error } = await supabase
    .from("service_prices")
    .select("id, name, unit, price, active")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data as ServicePrice[];
}

export async function fetchMyOrders() {
  // "Users can view their own orders" — customer-side.
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
  const { data, error } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", orderId);
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
  scheduledFor: string | null;
  notes: string | null;
  items: { servicePriceId: string; quantity: number; unitPrice: number }[];
};

export async function createOrder(input: NewOrderInput) {
  const total = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  // "Users can insert their own orders" requires auth.uid() = user_id.
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      user_id: input.userId,
      status: "pending" satisfies OrderStatus,
      address: input.address,
      address_lat: input.addressLat,
      address_lng: input.addressLng,
      scheduled_for: input.scheduledFor,
      notes: input.notes,
      total_amount: total,
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
        service_price_id: item.servicePriceId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
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
    .update({ courier_id: courierId, status: "collecting" satisfies OrderStatus })
    .eq("id", orderId)
    .eq("status", "pending" satisfies OrderStatus)
    .is("courier_id", null);
  if (error) throw error;
}

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  collecting: "cleaning",
  cleaning: "delivering",
  delivering: "completed",
};

// "Couriers update assigned orders" — advance the job one step.
export async function advanceOrderStatus(orderId: string, currentStatus: OrderStatus) {
  const next = NEXT_STATUS[currentStatus];
  if (!next) throw new Error(`No next status after "${currentStatus}"`);
  const { error } = await supabase.from("orders").update({ status: next }).eq("id", orderId);
  if (error) throw error;
  return next;
}
