# Recovered schema notes

Source: `pg_policies` dump from the live Supabase project (`dzplzvogobqmwaaimkef`),
pulled 2026-08-20. Column-level detail is filled in as we get more of the
`information_schema.columns` dump.

## Tables identified

- `profiles` — `id` (= `auth.uid()`), `role` (`customer` | `courier` | `admin`)
- `orders` — `id`, `user_id`, `courier_id`, `status`
  - status values seen: `pending`, `collecting`, `cleaning`, `delivering`, `cancelled`
- `order_items` — `id`, `order_id`
- `order_offers` — courier bidding on jobs: `id`, `order_id`, `courier_id`
- `service_prices` — `id`, `active` (public read when active)
- `payments` — `id`, `order_id` (joined to `orders.user_id` for access)
- `payment_intents` — `id`, `user_id`
- `wallet_transactions` — **columns confirmed**: `id` (uuid, `gen_random_uuid()`),
  `user_id` (uuid), `amount` (numeric), `kind` (text), `order_id` (uuid, nullable),
  `note` (text, nullable), `created_at` (timestamptz, `now()`)
- `notifications` — `id`, `user_id`
- `customer_details` — `id` (= `auth.uid()`)
- `courier_details` — `id` (= `auth.uid()`)

## Behavior implied by policies

- Courier assignment flow: order starts `pending` (visible to all couriers),
  couriers can submit `order_offers`, order gets a `courier_id` once assigned.
- Couriers can only update orders they're assigned to, or claim a `pending`
  unassigned order.
- Customers can cancel their own order only while it's still `pending`
  (`status` must transition to `cancelled`).
- Customer and assigned courier can see a limited view of each other's
  profile/details while an order is active (`collecting`/`cleaning`/`delivering`).
- `customer_details` / `courier_details` are also readable by `admin` role.
- `service_prices` has a public-read policy for `active = true` rows — likely
  the pricing shown on the booking screen.

## Postgres functions (confirmed source)

```sql
CREATE OR REPLACE FUNCTION public.is_assigned_courier_for(customer_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.user_id = customer_id
      AND o.courier_id = auth.uid()
      AND o.status IN ('pending', 'collecting', 'cleaning', 'delivering')
  );
$function$
```

`is_my_assigned_courier(id)` is presumably the customer-side mirror (same
shape, checks `o.courier_id = courier_id AND o.user_id = auth.uid()`) but
still needs to be pulled to confirm — the earlier `pg_proc` query only
returned this one function so far, run it again if the second row didn't
come back.

## Still needed

- Full column list for every table above (run the `information_schema.columns`
  query and paste back **all** rows, not just one table).
- `is_my_assigned_courier(id)` source (see above).
- Any Edge Functions source (Dashboard → Edge Functions).
- Storage bucket names + public/private status.
