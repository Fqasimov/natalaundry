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

export type BoxTier = "daily_bronze" | "gold" | "legendary_vip";

export type RewardDefinition = {
  kind: RewardKind;
  title: string;
  description: string;
  icon: string;
  gradient: [string, string];
  /** Payload interpreted by the API when the reward is applied to an order. */
  value?: { amount?: number; percent?: number; serviceId?: string; points?: number };
};

// The six rewards the video shows in "QAZANDIĞINIZ AKTİV MÜKAFATLAR", plus
// the discount coupon revealed by the box-opening animation.
export const REWARD_DEFINITIONS: Record<RewardKind, RewardDefinition> = {
  balance_bonus: {
    kind: "balance_bonus",
    title: "4 AZN Balans Bonusu",
    description: "Sifariş cəminizdən avtomatik çıxılır",
    icon: "wallet",
    gradient: ["#FFC93C", "#F5A623"],
    value: { amount: 4 },
  },
  free_express_delivery: {
    kind: "free_express_delivery",
    title: "Pulsuz Ekspress Çatdırılma",
    description: "Növbəti sifarişinizdə çatdırılma haqqı 0 ₼-dir",
    icon: "car",
    gradient: ["#FFA654", "#F2762A"],
  },
  free_service: {
    kind: "free_service",
    title: "Pulsuz Kostyum Təmizləmə",
    description: "1 ədəd 2-li kostyum tam ödənişsiz quru təmizlənir",
    icon: "briefcase",
    gradient: ["#FF8A48", "#E5561B"],
    value: { serviceId: "dry_cleaning" },
  },
  eco_points: {
    kind: "eco_points",
    title: "100 Eko Xal Hədiyyə",
    description: "100 yaşıl xal balansınıza yükləndi",
    icon: "star",
    gradient: ["#FFB23F", "#F07C1E"],
    value: { points: 100 },
  },
  eco_care_package: {
    kind: "eco_care_package",
    title: "Ekstra Eko-Baxış Paketi",
    description: "Antibakterial zərif baxış xidməti hədiyyə olunur",
    icon: "leaf",
    gradient: ["#3FA45B", "#1F7A3C"],
  },
  vip_care_package: {
    kind: "vip_care_package",
    title: "VIP Qulluq Hədiyyə Paketi",
    description: "Paltarlarınız üçün xüsusi qoruyucu qulluq",
    icon: "sparkles",
    gradient: ["#A24BD6", "#6E1FA8"],
  },
  discount_coupon: {
    kind: "discount_coupon",
    title: "20% Endirim Kuponu",
    description: "Quru təmizləmə xidmətinə 20% xüsusi endirim",
    icon: "pricetag",
    gradient: ["#FF7A4D", "#E5342B"],
    value: { percent: 20, serviceId: "dry_cleaning" },
  },
};

export type BoxDefinition = {
  tier: BoxTier;
  title: string;
  description: string;
  badge: string;
  badgeTone: "info" | "primary" | "muted";
  icon: string;
  gradient: [string, string];
};

export const BOX_DEFINITIONS: BoxDefinition[] = [
  {
    tier: "daily_bronze",
    title: "Gündəlik Bürünc Qutu",
    description: "Hər gün pulsuz 1 dəfə açın!",
    badge: "PULSUZ",
    badgeTone: "primary",
    icon: "cube",
    gradient: ["#FFD255", "#F0A81E"],
  },
  {
    tier: "gold",
    title: "Qızıl Hədiyyə Qutusu",
    description: "Hər sifarişdən sonra verilən qutu!",
    badge: "QIZIL",
    badgeTone: "primary",
    icon: "gift",
    gradient: ["#FF9A3C", "#E5561B"],
  },
  {
    tier: "legendary_vip",
    title: "Əfsanəvi VIP Qutusu",
    description: "Nata Plus və Gold VIP istifadəçilər üçün.",
    badge: "ƏFSANƏVİ",
    badgeTone: "muted",
    icon: "diamond",
    gradient: ["#A24BD6", "#5E1694"],
  },
];

/** A reward the customer has won and not yet spent. */
export type ActiveReward = {
  id: string;
  kind: RewardKind;
  expiresAt: string;
};

export function daysLeft(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** Rewards expire one week after being claimed, per the video's copy. */
export const REWARD_TTL_DAYS = 7;
