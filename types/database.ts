// Schema inferred from Supabase RLS policies (pg_policies) recovered from the
// live project on 2026-08-20. This is a PARTIAL picture — column-level detail
// is filled in as we get the full `information_schema.columns` dump back.
// Treat everything here as provisional until cross-checked against that.

export type UserRole = "customer" | "courier" | "admin";

// orders.status values referenced across the RLS policies:
// 'pending' -> 'collecting' -> 'cleaning' -> 'delivering' -> (done) | 'cancelled'
export type OrderStatus = "pending" | "collecting" | "cleaning" | "delivering" | "cancelled";

export type Profile = {
  id: string; // = auth.uid()
  role: UserRole;
};

export type Order = {
  id: string;
  user_id: string;
  courier_id: string | null;
  status: OrderStatus;
  // additional columns unknown pending full schema dump
};

export type OrderItem = {
  id: string;
  order_id: string;
};

export type OrderOffer = {
  id: string;
  order_id: string;
  courier_id: string;
};

export type ServicePrice = {
  id: string;
  active: boolean;
};

export type Payment = {
  id: string;
  order_id: string;
};

export type PaymentIntent = {
  id: string;
  user_id: string;
};

// Confirmed via information_schema dump (first table returned):
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
};

export type CustomerDetails = {
  id: string; // = auth.uid()
};

export type CourierDetails = {
  id: string; // = auth.uid()
};
