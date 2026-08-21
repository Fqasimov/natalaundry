/**
 * The first-order welcome offer.
 *
 * Mirrors backend/config/nata.php `promo.*` and App\Services\PromoService.
 * The customer never types this code in — it is advertised on the home screen
 * and the server applies it automatically to their first order. The values
 * here are only for display and for the estimate shown before checkout; the
 * server recomputes the discount when the order is written, so a stale copy
 * here can never overcharge or undercharge anyone.
 */
export const FIRST_ORDER_CODE = "ILK20";
export const FIRST_ORDER_PERCENT = 20;

/** What the welcome offer is worth against a given subtotal. */
export function firstOrderDiscount(subtotal: number): number {
  return Math.round(subtotal * (FIRST_ORDER_PERCENT / 100) * 100) / 100;
}
