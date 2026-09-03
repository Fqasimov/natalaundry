import { supabase } from "./supabase";
import { courierNextStep, type LifecycleState } from "./lifecycle";
import { priceServiceIdFor } from "./catalog";
import { timed } from "./perf";
import type { PaymentMethod } from "@/lib/payments";
import type { Order, OrderItem, OrderStatus } from "@/types/database";

// Queries here match the confirmed schema (information_schema dump,
// 2026-08-20) and the RLS policies pulled earlier — the claim/advance/cancel
// transitions below only work because they mirror those policies exactly.
//
// `service_prices` real columns are still unconfirmed (see lib/catalog.ts) —
// booking currently uses the static catalog instead of that table.

/**
 * The signed-in customer's own orders.
 *
 * Filtered by user_id here as well as by RLS. Relying on the policy alone
 * meant that if it were ever missing or written wrong, this screen would list
 * every order in the table — with each customer's address and phone on it.
 */
export async function fetchMyOrders() {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return [] as Order[];

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", userId)
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
  rewardId: string | null;
  /**
   * How the customer intends to pay. Recorded on the order so it is known
   * before the gateway is involved; the charge itself is started separately
   * by lib/payments.ts once the order exists and has a server-priced total.
   */
  paymentMethod: PaymentMethod;
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
  // getSession() reads the stored session; getUser() asks the auth server,
  // which is a full round trip on a mobile connection before the first write
  // has even started. The id is only used to fill user_id, and the INSERT
  // policy checks that against auth.uid() from the token anyway — so a stale
  // id cannot get an order filed against someone else, it just fails.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("not_signed_in");

  // No money is sent. subtotal/total are placeholders the triggers overwrite,
  // and discount/delivery_fee are stripped on insert and then derived from the
  // catalogue — see supabase/enforce-order-pricing.sql. Sending a figure here
  // would be ignored, which is the point.
  const { data: order, error } = await timed("orders.insert", () => supabase
    .from("orders")
    .insert({
      user_id: user.id,
      subtotal: 0,
      total: 0,
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
      // Was accepted in NewOrderInput and then silently dropped, so a gift
      // reward picked at checkout never reached the order at all.
      reward_id: input.rewardId,
      payment_method: input.paymentMethod,
    })
    .select()
    .single());

  if (error) throw error;

  // Prices are placeholders too: enforce_item_price rewrites each one from
  // service_prices and rejects an unknown or inactive item_id outright.
  const { error: itemsError } = await timed("order_items.insert", () =>
    supabase.from("order_items").insert(
    input.lines.map((line) => ({
      order_id: order.id,
      // The database's own vocabulary ("dryCleaning"), not the app's routing
      // key ("dry_cleaning") — the 31 existing order_items rows are written
      // that way and one column must not hold two vocabularies.
      service_id: priceServiceIdFor(line.serviceId),
      item_id: line.itemId,
      item_name: line.name,
      quantity: line.quantity,
      price: 0,
    })),
  ));

  if (itemsError) throw itemsError;

  // Re-read: the totals only exist after the item triggers have run.
  const { data: priced, error: readError } = await timed("orders.reread", () =>
    supabase
      .from("orders")
      .select()
      .eq("id", order.id)
      .single());

  if (readError) throw readError;
  return priced as Order;
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
  // Local session read rather than a round trip — see createOrder.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) throw new Error("not_signed_in");

  // service_type 'bulk' is what enforce_bulk_deposit keys on: it sets the
  // deposit, subtotal and total to the published ₼20 and clears any count,
  // so nothing about the money is decided here.
  const { data, error } = await supabase
    .from("orders")
    .insert({
      user_id: user.id,
      service_type: "bulk",
      subtotal: 0,
      total: 0,
      collection_time: input.collectionTime,
      delivery_time: input.deliveryTime,
      address: input.address,
      address_lat: input.addressLat,
      address_lng: input.addressLng,
      notes: input.notes,
      is_outside_city: input.isOutsideCity,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Order;
}

/**
 * Courier records the counted value of a bulk load.
 *
 * This is the price of the order, so it goes through `record_bulk_count`
 * rather than an UPDATE: the function checks the caller is the assigned
 * courier, that the order is a bulk one, and that the figure is not negative,
 * then works out the balance owed after the deposit. RLS could say "the
 * assigned courier may update this row"; it could not say what a sane value
 * for it is.
 *
 * This is the 1.0.2 function, unchanged.
 */
export async function recordTopluCount(
  orderId: string,
  _courierId: string,
  countedTotal: number
) {
  const { error } = await supabase.rpc("record_bulk_count", {
    order_id: orderId,
    amount: countedTotal,
  });
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
export async function claimOrderAtomically(orderId: string, _courierId: string): Promise<boolean> {
  const { error } = await supabase.rpc("transition_order", {
    p_order: orderId,
    p_to: "courier_assigned",
  });

  if (!error) return true;

  // Losing the race is an ordinary outcome, not a failure worth surfacing.
  // P0001 is the state machine or the offer check refusing; 42501 is a courier
  // the order was never offered to. Anything else is a real error.
  if (error.code === "P0001" || error.code === "42501") return false;

  throw error;
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
  const { error } = await supabase.rpc("transition_order", {
    p_order: orderId,
    p_to: to,
  });

  if (!error) return true;

  // The state machine refusing the move — a double-tap, or a step this actor
  // may not take. The caller reloads and shows the real state.
  if (error.code === "P0001" || error.code === "42501") return false;

  throw error;
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
 * Cancel an order.
 *
 * The database decides whether it is still cancellable: `transition_order`
 * only allows `cancelled` from the four states before a courier has physically
 * collected, so a customer cannot cancel a load already in the van.
 */
export async function cancelOrder(orderId: string) {
  const { error } = await supabase.rpc("transition_order", {
    p_order: orderId,
    p_to: "cancelled",
  });
  if (error) throw error;
}

/**
 * Claim a pending, unassigned order (the pre-lifecycle path still used by the
 * order detail screen).
 *
 * This is the original `claim_order` from the 1.0.2 architecture, kept because
 * it is better than a bare claim: it requires an entry in `order_offers`, so a
 * courier can only take an order genuinely offered to them, and it expires the
 * rival offers in the same transaction. It returns false rather than throwing
 * when someone else got there first.
 */
export async function claimOrder(orderId: string, _courierId: string) {
  const { data, error } = await supabase.rpc("claim_order", { p_order_id: orderId });
  if (error) throw error;
  return data === true;
}

/**
 * Advance the job one step.
 *
 * The step is derived from the order's current state rather than sent, so a
 * stale screen cannot skip ahead: the sequence is read from the database and
 * `transition_order` re-checks it under a row lock, along with whether this
 * caller is allowed to drive that particular step.
 */
export async function advanceOrderStatus(orderId: string, _currentStatus: OrderStatus) {
  const { data: current, error: readError } = await supabase
    .from("orders")
    .select("lifecycle_state")
    .eq("id", orderId)
    .single();

  if (readError) throw readError;

  // The same table the courier's button label comes from, so the action and
  // the step it performs cannot disagree.
  const next = courierNextStep(current?.lifecycle_state as LifecycleState | null)?.to;
  if (!next) {
    // Nothing left to advance to — delivered, or cancelled.
    const { data } = await supabase.from("orders").select("status").eq("id", orderId).single();
    return data?.status as OrderStatus;
  }

  const { error } = await supabase.rpc("transition_order", { p_order: orderId, p_to: next });
  if (error) throw error;

  const { data } = await supabase.from("orders").select("status").eq("id", orderId).single();
  return data?.status as OrderStatus;
}
