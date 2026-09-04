// Pricing rules reverse-engineered from the 1.0.2 screen recording.
//
// Evidence from the video:
//  * Order summary shows  Ara cəm ₼37.00 / Çatdırılma haqqı ₼5.00 / Ümumi ₼42.00
//  * A red note reads "Sifariş 40-dan az olduğu üçün 5 ₼ çatdırılma haqqı
//    əlavə edilir" — under ₼40, a ₼5 delivery fee applies.
//  * The upsell modal offers to top the basket up to ₼40 for free delivery.
//
// EXPRESS DOUBLES THE ORDER TOTAL (set 2026-09-04 by the owner). It is not a
// delivery surcharge: a ₼40 basket with free delivery totals ₼40 as standard
// and ₼80 as express. The 24-hour turnaround is charged as a multiple of the
// whole job, because that is what it costs to jump the queue — the delivery
// leg is the same drive either way.
//
// The doubling therefore applies AFTER the discount and AFTER the delivery
// fee, to the figure the customer would otherwise have paid. `deliveryFee`
// stays the honest cost of the delivery itself (₼0 or ₼5); the extra shows up
// as `expressSurcharge` so the summary can name it rather than hiding it
// inside the delivery line. An order row is auditable through
// `delivery_tier`: total = 2 x (subtotal - discount + delivery_fee).
//
// Two tiers were removed the same day:
//  * "Eko" priced identically to standard — a choice with no consequence.
//  * The outside-city fee and its slider. Nothing can set the flag any more,
//    so the fee is gone from the arithmetic. `orders.is_outside_city` is kept
//    for the orders that already carry it; it no longer affects a new price.
//
// The Laravel API mirrors this module and is the source of truth at checkout.

export const FREE_DELIVERY_THRESHOLD = 40;
export const BASE_DELIVERY_FEE = 5;

export const DELIVERY_TIERS = ["standard", "express"] as const;
export type DeliveryTier = (typeof DELIVERY_TIERS)[number];

/** What the tier multiplies the payable total by. */
const TIER_MULTIPLIER: Record<DeliveryTier, number> = {
  standard: 1,
  express: 2,
};

export type PriceInput = {
  subtotal: number;
  tier: DeliveryTier;
  discount?: number;
};

export type PriceBreakdown = {
  subtotal: number;
  deliveryFee: number;
  discount: number;
  /** What the express tier adds. Zero on standard. */
  expressSurcharge: number;
  total: number;
  qualifiesForFreeDelivery: boolean;
  amountToFreeDelivery: number;
};

/** The delivery leg alone — unaffected by the tier. */
export function deliveryFeeFor(subtotal: number) {
  return subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : BASE_DELIVERY_FEE;
}

export function priceOrder({
  subtotal,
  tier,
  discount = 0,
}: PriceInput): PriceBreakdown {
  const deliveryFee = deliveryFeeFor(subtotal);
  const cappedDiscount = Math.min(discount, subtotal);
  const payable = Math.max(0, subtotal + deliveryFee - cappedDiscount);

  // Express charges that whole figure a second time.
  const expressSurcharge = payable * (TIER_MULTIPLIER[tier] - 1);

  return {
    subtotal,
    deliveryFee,
    discount: cappedDiscount,
    expressSurcharge,
    total: payable + expressSurcharge,
    qualifiesForFreeDelivery: subtotal >= FREE_DELIVERY_THRESHOLD,
    amountToFreeDelivery: Math.max(0, FREE_DELIVERY_THRESHOLD - subtotal),
  };
}

/**
 * Garment photos are optional.
 *
 * The shipped 1.0.2 build hard-gated checkout on three photos. That gate is
 * gone: it blocked orders outright, and the photos exist to document
 * pre-existing defects, which is worth encouraging but not worth losing an
 * order over. The uploader is still offered and still suggests this many —
 * `RECOMMENDED_PHOTOS` drives the "0/3" counter — but nothing enforces it.
 *
 * The server no longer requires them either (see backend/config/nata.php);
 * leaving the gate on only one side would just move the failure.
 */
export const RECOMMENDED_PHOTOS = 3;
