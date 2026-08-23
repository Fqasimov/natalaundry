import type { Ionicons } from "@expo/vector-icons";

/** Ionicons glyph names, so a typo is a compile error rather than a blank circle. */
type IoniconName = keyof typeof Ionicons.glyphMap;

// Hədiyyə Qutusu (gift box) system, modelled from the 1.0.2 recording.
//
// IMPORTANT: no rewards tables appeared in the information_schema dump we
// have — but `orders.reward_id` exists, and that dump was visibly truncated
// (it cut off inside `service_prices`, and the already-confirmed
// `wallet_transactions` is missing from it too). So the real tables backing
// this feature are almost certainly there and simply weren't returned.
// Until they are, the Laravel API owns these definitions and the app talks
// to it through the shapes below.

export type RewardKind =
  | "balance_bonus"
  | "free_express_delivery"
  | "free_service"
  | "eco_points"
  | "eco_care_package"
  | "vip_care_package"
  | "discount_coupon";

/**
 * One tier: the box a finalised order earns.
 *
 * The daily box handed out balance for no purchase and the VIP box gated
 * prizes behind a subscription that is not live, so both are gone.
 */
export type BoxTier = "order";

/**
 * How a prize *looks*. What it says comes from the server row rendered through
 * lib/rewards-i18n — there are fifty prizes but only these few shapes, so the
 * icon and colour are all the app needs to hold locally.
 */
export type RewardPresentation = {
  icon: IoniconName;
  gradient: [string, string];
};

export const REWARD_PRESENTATION: Record<RewardKind, RewardPresentation> = {
  balance_bonus: { icon: "wallet", gradient: ["#FFC93C", "#F5A623"] },
  free_express_delivery: { icon: "car", gradient: ["#FFA654", "#F2762A"] },
  free_service: { icon: "sparkles-outline", gradient: ["#FF8A48", "#E5561B"] },
  eco_points: { icon: "star", gradient: ["#FFB23F", "#F07C1E"] },
  eco_care_package: { icon: "leaf", gradient: ["#3FA45B", "#1F7A3C"] },
  vip_care_package: { icon: "sparkles", gradient: ["#A24BD6", "#6E1FA8"] },
  discount_coupon: { icon: "pricetag", gradient: ["#FF7A4D", "#E5342B"] },
};

/** The one box. Its copy lives in lib/i18n like the rest of the interface. */
export const BOX_TIER: BoxTier = "order";

export function daysLeft(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** Rewards expire one week after being claimed, per the video's copy. */
export const REWARD_TTL_DAYS = 7;
