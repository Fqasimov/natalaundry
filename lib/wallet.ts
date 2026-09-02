import { supabase } from "@/lib/supabase";

/**
 * Nata Balance.
 *
 * The balance lives on `profiles.wallet_balance` and its ledger in
 * `wallet_transactions`. Both are read here under RLS, but nothing is ever
 * *written*: the balance is money, and it is maintained by the
 * sync_wallet_balance trigger from the ledger, which itself is only written by
 * SECURITY DEFINER functions. So the app reads the server's opinion of the
 * balance and never forms its own.
 */

export type WalletKind =
  | "top_up"
  | "topup"
  | "order"
  | "order_payment"
  | "refund"
  | "bonus"
  | "reward"
  | "referral";

export type WalletEntry = {
  id: string;
  amount: number;
  kind: WalletKind | string;
  note: string | null;
  order_id: string | null;
  created_at: string | null;
};

export type WalletSummary = {
  balance: number;
  currency: string;
  transactions: WalletEntry[];
  min_topup: number;
  max_topup: number;
  topup_presets: number[];
};

/** Published limits, mirroring `nata.wallet` in the backend config. */
export const MIN_TOPUP = 5;
export const MAX_TOPUP = 500;
export const TOPUP_PRESETS = [10, 20, 50, 100];

/**
 * The balance and its ledger.
 *
 * `profiles.wallet_balance` is read, never derived: the balance is maintained
 * by the sync_wallet_balance trigger from wallet_transactions, so summing the
 * ledger here would be a second opinion about money, and the two would
 * eventually disagree. The transactions are shown as history only.
 */
export async function fetchWallet(): Promise<WalletSummary> {
  const [profile, ledger] = await Promise.all([
    supabase.from("profiles").select("wallet_balance").single(),
    supabase
      .from("wallet_transactions")
      .select("id, amount, kind, note, order_id, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (profile.error) throw profile.error;
  if (ledger.error) throw ledger.error;

  return {
    balance: Number(profile.data?.wallet_balance ?? 0),
    currency: "₼",
    transactions: (ledger.data ?? []).map((t) => ({
      id: t.id,
      amount: Number(t.amount),
      kind: t.kind,
      note: t.note,
      order_id: t.order_id,
      created_at: t.created_at,
    })),
    min_topup: MIN_TOPUP,
    max_topup: MAX_TOPUP,
    topup_presets: TOPUP_PRESETS,
  };
}

type TopUpStart = {
  topup_id: string;
  amount: number;
  redirect_url: string;
};

/**
 * Opens a top-up at the bank and returns where to send the customer.
 *
 * Through the `payments` Edge Function rather than straight to Kapital: the
 * bank credentials must never reach a phone, and the bank needs a public URL
 * to redirect back to. The amount is a proposal — the function bounds it and
 * records what it accepted, so the figure eventually credited is its, not
 * this one's.
 */
export async function startTopUp(amount: number, language = "az"): Promise<TopUpStart> {
  const { data, error } = await supabase.functions.invoke<{ data: TopUpStart & { hpp_url: string } }>(
    "payments",
    { body: { action: "topup", amount, language } },
  );

  if (error) throw error;
  if (!data?.data) throw new Error("could_not_start_topup");

  return {
    topup_id: data.data.topup_id,
    amount: data.data.amount,
    redirect_url: data.data.hpp_url,
  };
}

export type TopUpState = {
  status: string;
  settled: boolean;
  amount?: number;
  balance: number;
  /** True when the gateway could not be reached and this is the last known state. */
  stale?: boolean;
};

/**
 * What became of a top-up.
 *
 * Read from our own row rather than asked of the bank: the callback function
 * is what talks to Kapital, verifies the payment and settles the row. So this
 * is watching for that settlement to land, which is why waitForTopUp below
 * polls rather than reading once.
 */
export async function fetchTopUpState(topupId: string): Promise<TopUpState> {
  const [topup, profile] = await Promise.all([
    supabase
      .from("wallet_topups")
      .select("status, amount, settled_at")
      .eq("id", topupId)
      .single(),
    supabase.from("profiles").select("wallet_balance").single(),
  ]);

  if (topup.error) throw topup.error;

  return {
    status: topup.data?.status ?? "pending",
    settled: topup.data?.settled_at != null,
    amount: topup.data?.amount != null ? Number(topup.data.amount) : undefined,
    balance: Number(profile.data?.wallet_balance ?? 0),
  };
}

/**
 * Polls until the top-up settles or the attempts run out.
 *
 * Mirrors waitForSettlement in lib/payments.ts and for the same reason: 3-D
 * Secure can leave a payment briefly in flight after the browser closes, so a
 * single check can read 'pending' on money that is about to arrive.
 */
export async function waitForTopUp(
  topupId: string,
  { attempts = 5, delayMs = 1500 }: { attempts?: number; delayMs?: number } = {},
): Promise<TopUpState> {
  let state = await fetchTopUpState(topupId);

  for (let i = 1; i < attempts && !state.settled && state.status === "pending"; i++) {
    await new Promise((resolve) => setTimeout(resolve, delayMs * i));
    state = await fetchTopUpState(topupId);
  }

  return state;
}
