import { apiPost, apiRequest } from "@/lib/api";

/**
 * Nata Balance.
 *
 * The balance lives on `profiles.wallet_balance` and its ledger in
 * `wallet_transactions`, but neither is read directly here: both come through
 * the API, because the balance is money and the server is the only thing that
 * decides what it is. The app never computes a balance from the ledger.
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

export async function fetchWallet(): Promise<WalletSummary> {
  return apiRequest<WalletSummary>("wallet");
}

type TopUpStart = {
  topup_id: string;
  amount: number;
  redirect_url: string;
};

/**
 * Opens a top-up at the bank and returns where to send the customer.
 *
 * The amount is a proposal: the server bounds it against
 * `nata.wallet.min_topup`/`max_topup` and records what it accepted, so the
 * figure that eventually gets credited is the server's, not this one.
 */
export async function startTopUp(amount: number, language = "az"): Promise<TopUpStart> {
  const { data } = await apiPost<{ data: TopUpStart }>("wallet/topup", {
    amount,
    language,
  });
  return data;
}

export type TopUpState = {
  status: string;
  settled: boolean;
  amount?: number;
  balance: number;
  /** True when the gateway could not be reached and this is the last known state. */
  stale?: boolean;
};

/** What became of a top-up, re-read from the bank server-side. */
export async function fetchTopUpState(topupId: string): Promise<TopUpState> {
  const { data } = await apiRequest<{ data: TopUpState }>(`wallet/topup/${topupId}`);
  return data;
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
