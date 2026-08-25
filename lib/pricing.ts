// Pricing rules reverse-engineered from the 1.0.2 screen recording.
//
// Evidence from the video:
//  * Order summary shows  Ara cəm ₼37.00 / Çatdırılma haqqı ₼5.00 / Ümumi ₼42.00
//  * A red note reads "Sifariş 40-dan az olduğu üçün 5 ₼ çatdırılma haqqı
//    əlavə edilir" — under ₼40, a ₼5 delivery fee applies.
//  * The upsell modal offers to top the basket up to ₼40 for free delivery.
//  * Tier cards read: Standart +5.00 ₼, Ekspres (24 saat) +10.00 ₼, Eko +5.00 ₼
//    while the subtotal was ₼37 (i.e. below the threshold).
//
// The tier numbers are therefore modelled as `base fee + tier surcharge`,
// which reproduces every figure the video shows. One reading the video can't
// disambiguate is whether Ekspres is instead a flat ₼10 regardless of
// subtotal; if the real rule turns out to be flat, set EXPRESS_IS_FLAT below.
// The Laravel API mirrors this module and is the source of truth at checkout.

export const FREE_DELIVERY_THRESHOLD = 40;
export const BASE_DELIVERY_FEE = 5;
export const OUTSIDE_CITY_FEE = 5;
export const EXPRESS_IS_FLAT = false;
export const EXPRESS_FLAT_FEE = 10;

export const DELIVERY_TIERS = ["standard", "express", "eco"] as const;
export type DeliveryTier = (typeof DELIVERY_TIERS)[number];

const TIER_SURCHARGE: Record<DeliveryTier, number> = {
  standard: 0,
  express: 5,
  eco: 0,
};

export type PriceInput = {
  subtotal: number;
  tier: DeliveryTier;
  isOutsideCity: boolean;
  discount?: number;
};

export type PriceBreakdown = {
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  qualifiesForFreeDelivery: boolean;
  amountToFreeDelivery: number;
};

export function deliveryFeeFor(
  subtotal: number,
  tier: DeliveryTier,
  isOutsideCity = false
) {
  if (tier === "express" && EXPRESS_IS_FLAT) {
    return EXPRESS_FLAT_FEE + (isOutsideCity ? OUTSIDE_CITY_FEE : 0);
  }
  const base = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : BASE_DELIVERY_FEE;
  const outside = isOutsideCity ? OUTSIDE_CITY_FEE : 0;
  return base + TIER_SURCHARGE[tier] + outside;
}

export function priceOrder({
  subtotal,
  tier,
  isOutsideCity,
  discount = 0,
}: PriceInput): PriceBreakdown {
  const deliveryFee = deliveryFeeFor(subtotal, tier, isOutsideCity);
  const cappedDiscount = Math.min(discount, subtotal);
  const total = Math.max(0, subtotal + deliveryFee - cappedDiscount);
  return {
    subtotal,
    deliveryFee,
    discount: cappedDiscount,
    total,
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
