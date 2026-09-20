import { supabase } from "@/lib/supabase";
import type { StringKey } from "@/lib/i18n";

/**
 * Account deletion — see supabase/account-deletion.sql for what it actually
 * does to the data.
 *
 * The function takes no arguments: the account deleted is always the caller's,
 * read from the verified JWT. There is deliberately no way for this module to
 * ask for a different one.
 */

/**
 * The database raises bare tokens rather than sentences, because a message
 * written in SQL is the one string in the app that cannot be translated. Each
 * maps to a key here; anything unrecognised falls back to the generic failure
 * rather than putting a Postgres error in front of a customer.
 */
const REASONS: Record<string, StringKey> = {
  ACCOUNT_DELETE_NOT_SIGNED_IN: "deleteAccountNotSignedIn",
  ACCOUNT_DELETE_NO_PROFILE: "deleteAccountFailed",
  ACCOUNT_DELETE_STAFF: "deleteAccountStaff",
  ACCOUNT_DELETE_ACTIVE_ORDER: "deleteAccountActiveOrder",
};

export type DeleteAccountResult = { ok: true } | { ok: false; reason: StringKey };

export async function deleteMyAccount(): Promise<DeleteAccountResult> {
  const { error } = await supabase.rpc("delete_my_account");
  if (!error) return { ok: true };

  // Postgres wraps the raised token in its own message, so match rather than
  // compare: "ACCOUNT_DELETE_ACTIVE_ORDER" arrives inside a longer string.
  const token = Object.keys(REASONS).find((k) => error.message.includes(k));
  return { ok: false, reason: token ? REASONS[token] : "deleteAccountFailed" };
}
