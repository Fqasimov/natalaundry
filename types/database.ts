// Schema inferred from Supabase RLS policies (pg_policies) recovered from the
// live project on 2026-08-20. Fields marked PROVISIONAL are guesses needed to
// build real screens — they are NOT confirmed by a schema dump yet. Swap them
// for the real column names/types the moment the full `information_schema`
// dump comes back (see SCHEMA_NOTES.md).

export type UserRole = "customer" | "courier" | "admin";

// orders.status values referenced across the RLS policies:
// 'pending' -> 'collecting' -> 'cleaning' -> 'delivering' -> (done) | 'cancelled'
// 'completed' is PROVISIONAL — never appeared in a policy, but the flow
// needs a terminal success state distinct from 'cancelled'.
export type OrderStatus = "pending" | "collecting" | "cleaning" | "delivering" | "completed" | "cancelled";

export type Profile = {
  id: string; // = auth.uid()
  role: UserRole;
};

export type Order = {
  id: string;
  user_id: string;
  courier_id: string | null;
  status: OrderStatus;
  created_at: string; // PROVISIONAL
  // PROVISIONAL — booking details not yet confirmed by schema dump
  address: string | null;
  address_lat: number | null;
  address_lng: number | null;
  scheduled_for: string | null; // timestamptz
  total_amount: number | null;
  notes: string | null;
};

export type OrderItem = {
  id: string;
  order_id: string;
  // PROVISIONAL
  service_price_id: string;
  quantity: number;
  unit_price: number;
};

export type OrderOffer = {
  id: string;
  order_id: string;
  courier_id: string;
  // PROVISIONAL
  created_at: string;
  status: "pending" | "accepted" | "rejected";
};

export type ServicePrice = {
  id: string;
  active: boolean;
  // PROVISIONAL
  name: string;
  unit: string; // e.g. "per item", "per kg"
  price: number;
};

export type Payment = {
  id: string;
  order_id: string;
  // PROVISIONAL
  amount: number;
  status: string;
  created_at: string;
};

export type PaymentIntent = {
  id: string;
  user_id: string;
  // PROVISIONAL
  order_id: string | null;
  amount: number;
  status: string;
};

// Confirmed via information_schema dump:
export type WalletTransaction = {
  id: string; // uuid, default gen_random_uuid()
  user_id: string; // uuid
  amount: number; // numeric
  kind: string; // text
  order_id: string | null; // uuid, nullable
  note: string | null; // text, nullable
  created_at: string; // timestamptz, default now()
};

export type Notification = {
  id: string;
  user_id: string;
  // PROVISIONAL
  title: string;
  body: string;
  read: boolean;
  created_at: string;
};

export type CustomerDetails = {
  id: string; // = auth.uid()
  // PROVISIONAL
  full_name: string | null;
  phone: string | null;
  default_address: string | null;
};

export type CourierDetails = {
  id: string; // = auth.uid()
  // PROVISIONAL
  full_name: string | null;
  phone: string | null;
  vehicle: string | null;
  rating: number | null;
};
