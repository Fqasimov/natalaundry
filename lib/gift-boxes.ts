import { apiPost, apiRequest } from "@/lib/api";
import type { RewardKind } from "@/lib/rewards";

/**
 * The gift box, server-side.
 *
 * A box is not a thing the customer owns — it is a finalised order that has
 * not been opened yet. The draw happens on the server, so the app asks for a
 * box to be opened and is told what came out; it never picks the prize.
 */
export type RewardValue = {
  amount?: number;
  points?: number;
  percent?: number;
  service_id?: string;
  item_id?: string;
};

export type ActiveReward = {
  id: string;
  kind: RewardKind;
  /** Azerbaijani source text; the app renders from kind + value instead. */
  title: string;
  description: string;
  value: RewardValue | null;
  won_at: string | null;
  expires_at: string;
  days_left: number;
};

/** A finalised order whose box is still unopened. */
export type UnopenedBox = {
  order_id: string;
  order_no: string | null;
  total: number;
  completed_at: string | null;
};

export type GiftBoxState = {
  active_rewards: ActiveReward[];
  boxes: UnopenedBox[];
  ttl_days: number;
};

export const fetchGiftBoxes = () => apiRequest<GiftBoxState>("gift-boxes");

/** Opens the box a finalised order earned. The server draws the prize. */
export const openGiftBox = (orderId: string) =>
  apiPost<ActiveReward>("gift-boxes/open", { order_id: orderId });
