// Schema confirmed via information_schema.columns dump from the live
// Supabase project (dzplzvogobqmwaaimkef), pulled 2026-08-20. This replaces
// all earlier guesses. `service_prices` is still incomplete — only
// item_id/service_id came back, no price/name/active columns, which can't
// be right given "Anyone can read active prices" RLS policy exists on it.
// Re-pull that one table's columns and fill in ServicePrice below.

export type UserRole = "user" | "courier" | "admin";

// orders.status (customer/courier-facing macro state):
export type OrderStatus = "pending" | "collecting" | "cleaning" | "delivering" | "completed" | "cancelled";

// orders.lifecycle_state — the nine-step collection → laundry → delivery flow
// (App\Support\OrderLifecycle server-side, lib/lifecycle.ts here). `status`
// above is derived from it on every transition, so the two never disagree.
export type { LifecycleState } from "@/lib/lifecycle";

// orders.dispatch_state (internal admin workflow — an order is approved by
// an admin before it's offered to couriers). Values beyond the default and
// what 'assigned_at'/'offered_at'/'approved_at' imply are still a guess.
export type DispatchState = "awaiting_admin" | "approved" | "offered" | "assigned" | (string & {});

export type Profile = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  language: string; // default 'az' — app is Azerbaijani-first
  points: number;
  is_subscribed: boolean;
  push_token: string | null;
  last_active_at: string | null;
  birthday: string | null; // date
  created_at: string;
  role: UserRole | null;
  wallet_balance: number;
  subscription_expires_at: string | null;
};

export type Order = {
  id: string;
  user_id: string;
  status: OrderStatus;
  delivery_tier: string; // default 'standard'
  subtotal: number;
  discount: number;
  delivery_fee: number;
  total: number;
  collection_time: string; // free-text slot label, e.g. "Today, 2-4 PM"
  delivery_time: string; // free-text slot label
  created_at: string;
  courier_id: string | null;
  reward_id: string | null;
  service_type: string; // default 'standard'
  address: string | null;
  address_lat: number | null;
  address_lng: number | null;
  notes: string | null;
  deposit_amount: number | null;
  counted_total: number | null; // set once courier/staff weigh-counts items
  counted_at: string | null;
  counted_by: string | null;
  payment_method: string | null;
  payment_status: string | null; // default 'pending'
  is_outside_city: boolean;
  item_photos: string[]; // jsonb array of photo URLs
  dispatch_state: DispatchState;
  approved_at: string | null;
  offered_at: string | null;
  assigned_at: string | null;
  order_no: number; // human-facing sequential order number
  collected_at: string | null;
  cleaning_started_at: string | null;
  delivering_at: string | null;
  delivered_at: string | null;
  lifecycle_state: import("@/lib/lifecycle").LifecycleState;
  processing_finished_at: string | null;
  promo_code: string | null;
};

/** One append-only row per lifecycle transition; drives the timeline. */
export type OrderStatusLog = {
  id: string;
  order_id: string;
  from_state: string | null;
  to_state: string;
  actor_id: string | null;
  actor_role: string | null;
  note: string | null;
  created_at: string;
};

/** A GPS fix streamed by a courier while en route. */
export type CourierLocation = {
  id: string;
  order_id: string;
  courier_id: string;
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
  recorded_at: string | null;
  created_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  service_id: string;
  item_id: string;
  item_name: string;
  price: number;
  quantity: number;
};

export type OrderOffer = {
  id: string;
  order_id: string;
  courier_id: string;
  offered_at: string;
  responded_at: string | null;
  response: string | null; // e.g. 'accepted' / 'rejected', still a guess
};

// INCOMPLETE — only item_id/service_id confirmed so far. Needs a price and
// almost certainly a name/active flag to match "Anyone can read active
// prices" RLS policy. Do not trust this shape yet.
export type ServicePrice = {
  item_id: string;
  service_id: string;
  price?: number;
  active?: boolean;
  name?: string;
};

export type Payment = {
  id: string;
  order_id: string;
  amount: number;
  status: string; // default 'Pending'
  payment_method: string; // default 'Card'
  transaction_ref: string | null;
  created_at: string;
};

export type PaymentIntent = {
  id: string;
  user_id: string;
  purpose: string;
  amount: number;
  status: string; // default 'pending'
  transaction_ref: string | null;
  created_at: string;
  settled_at: string | null;
};

export type WalletTransaction = {
  id: string;
  user_id: string;
  amount: number;
  kind: string;
  order_id: string | null;
  note: string | null;
  created_at: string;
};

export type Notification = {
  id: string;
  user_id: string;
  order_id: string | null;
  kind: string;
  payload: Record<string, unknown>; // jsonb — shape varies by `kind`
  read: boolean;
  created_at: string;
};

export type CustomerDetails = {
  id: string;
  stripe_customer_id: string | null;
  loyalty_points: number;
  created_at: string;
  updated_at: string;
};

export type CourierDetails = {
  id: string;
  vehicle_type: string | null;
  license_plate: string | null;
  is_active: boolean;
  current_lat: number | null;
  current_lng: number | null;
  last_location_update: string | null;
  created_at: string;
  updated_at: string;
};
