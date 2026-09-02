import { supabase } from "@/lib/supabase";
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

const TTL_DAYS = 7;

const daysLeft = (expiresAt: string): number =>
  Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000));

/**
 * Everything the gift box screen needs, read under RLS.
 *
 * Two queries rather than one join: a box is the *absence* of an opening for a
 * completed order, which Postgres expresses as a NOT IN and PostgREST does not.
 * Both are keyed to auth.uid() by policy, so neither can see anyone else's.
 */
export async function fetchGiftBoxes(): Promise<GiftBoxState> {
  const [rewards, openings, orders] = await Promise.all([
    supabase
      .from("user_rewards")
      .select("id, won_at, expires_at, used_at, rewards(id, kind, title, description, value)")
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("won_at", { ascending: false }),
    supabase.from("gift_box_openings").select("order_id").eq("box_tier", "order"),
    supabase
      .from("orders")
      .select("id, order_no, total, delivered_at")
      .eq("status", "completed")
      .order("delivered_at", { ascending: false }),
  ]);

  if (rewards.error) throw rewards.error;
  if (openings.error) throw openings.error;
  if (orders.error) throw orders.error;

  const opened = new Set((openings.data ?? []).map((o) => o.order_id));

  return {
    ttl_days: TTL_DAYS,
    active_rewards: (rewards.data ?? []).map((r) => {
      // PostgREST types an embedded one-to-one as an array; it is one row.
      const reward = Array.isArray(r.rewards) ? r.rewards[0] : r.rewards;
      return {
        id: r.id,
        kind: reward?.kind as RewardKind,
        title: reward?.title ?? "",
        description: reward?.description ?? "",
        value: (reward?.value ?? null) as RewardValue | null,
        won_at: r.won_at,
        expires_at: r.expires_at,
        days_left: daysLeft(r.expires_at),
      };
    }),
    boxes: (orders.data ?? [])
      .filter((o) => !opened.has(o.id))
      .map((o) => ({
        order_id: o.id,
        order_no: o.order_no != null ? String(o.order_no) : null,
        total: Number(o.total),
        completed_at: o.delivered_at,
      })),
  };
}

/**
 * Opens the box a finalised order earned.
 *
 * The draw happens in `open_gift_box`, not here — a client that draws its own
 * prize can draw again until it likes the answer. The function locks the
 * profile row, re-checks eligibility inside the transaction and writes the
 * opening, so two taps in the same instant cannot both win.
 */
export async function openGiftBox(orderId: string): Promise<ActiveReward> {
  const { data, error } = await supabase.rpc("open_gift_box", { p_order_id: orderId });
  if (error) throw error;

  const won = data as {
    id: string;
    won_at: string;
    expires_at: string;
    reward: { kind: RewardKind; title: string; description: string | null; value: RewardValue | null };
  };

  return {
    id: won.id,
    kind: won.reward.kind,
    title: won.reward.title,
    description: won.reward.description ?? "",
    value: won.reward.value,
    won_at: won.won_at,
    expires_at: won.expires_at,
    days_left: daysLeft(won.expires_at),
  };
}

/* -------------------------------------------------------------------------
 * Demo mode
 *
 * The gift box is the one screen whose whole point is an animation, and it
 * used to be unreachable whenever the Laravel API was down. Now that the
 * data comes straight from Supabase it is reachable far more often, but the
 * fallback is worth keeping for offline and for a customer with no finalised
 * order to open.
 *
 * It is always labelled as a demo in the UI, and `demo: true` is on every
 * object it produces — nothing here is ever presented as a real prize, and
 * none of it is written anywhere. A refusal from the database (RLS, an
 * expired session, an ineligible box) is NOT swallowed; only being unable to
 * reach it at all triggers this, because that is the case where there is no
 * answer to show rather than a bad one.
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
 * True when the request failed because Supabase could not be reached at all,
 * rather than because it answered with an error.
 *
 * A PostgrestError always carries a `code` — a Postgres SQLSTATE, or one of
 * PostgREST's own. Anything that reached the database and came back is
 * therefore excluded here: those are real failures the customer should see,
 * not a reason to show a fake prize.
 */
function isUnreachable(error: unknown): boolean {
  return !(
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  );
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
