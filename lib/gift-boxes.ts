import { ApiError, apiPost, apiRequest } from "@/lib/api";
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

/* -------------------------------------------------------------------------
 * Demo mode
 *
 * The gift box is the one screen whose whole point is an animation, and it is
 * unreachable whenever the Laravel API is down — which is most of the time
 * during development, since EXPO_PUBLIC_API_URL points at a deployment that
 * may not exist yet. That made the reveal impossible to look at.
 *
 * So: when the API cannot be reached, the screen falls back to a local
 * sample. It is always labelled as a demo in the UI, and `demo: true` is on
 * every object it produces — nothing here is ever presented as a real prize,
 * and none of it is written anywhere. A real API error (401, 422, 500) is
 * NOT swallowed; only an unreachable server triggers this, because that is
 * the case where there is no answer to show rather than a bad one.
 * ---------------------------------------------------------------------- */

/** Marks state that came from the local sample rather than the server. */
export type DemoFlag = { demo?: boolean };

// Kinds come from RewardKind so the reveal renders with the real icon and
// gradient — a demo that looked different from production would not be
// showing the animation the customer actually gets.
const DEMO_PRIZES: Array<Pick<ActiveReward, "kind" | "title" | "description" | "value">> = [
  { kind: "discount_coupon", title: "20% endirim", description: "", value: { percent: 20 } },
  { kind: "free_express_delivery", title: "Pulsuz ekspres", description: "", value: {} },
  { kind: "balance_bonus", title: "5 ₼ balans", description: "", value: { amount: 5 } },
  { kind: "eco_points", title: "100 xal", description: "", value: { points: 100 } },
];

function demoState(): GiftBoxState & DemoFlag {
  return {
    demo: true,
    ttl_days: 7,
    active_rewards: [],
    boxes: [
      {
        order_id: "demo-box",
        order_no: "0000",
        total: 42,
        completed_at: new Date().toISOString(),
      },
    ],
  };
}

/**
 * True when the request failed because the server could not be reached at
 * all, rather than because it answered with an error.
 *
 * ApiError carries an HTTP status, so anything that reached the API and came
 * back is excluded here — those are real failures the customer should see.
 */
function isUnreachable(error: unknown): boolean {
  return !(error instanceof ApiError);
}

/**
 * Gift-box state, falling back to a labelled local sample when the API is
 * unreachable so the reveal animation can still be exercised.
 */
export async function fetchGiftBoxesOrDemo(): Promise<GiftBoxState & DemoFlag> {
  try {
    return await fetchGiftBoxes();
  } catch (error) {
    if (isUnreachable(error)) return demoState();
    throw error;
  }
}

/** Draws a sample prize locally. Never called for a real box. */
export function drawDemoReward(): ActiveReward & DemoFlag {
  const prize = DEMO_PRIZES[Math.floor(Math.random() * DEMO_PRIZES.length)];
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);

  return {
    ...prize,
    demo: true,
    id: `demo-${Date.now()}`,
    won_at: new Date().toISOString(),
    expires_at: expires.toISOString(),
    days_left: 7,
  };
}
