import { supabase } from "./supabase";
import type { LifecycleState } from "./lifecycle";

/**
 * The in-app notification inbox.
 *
 * Rows are written server-side by OrderLifecycleService on every transition.
 * Each carries an i18n key plus vars in `payload` — the app renders it in the
 * reader's own language — and a pre-rendered Azerbaijani `body` for channels
 * that can't translate. Prefer the key; fall back to `body` for older rows.
 */
export type AppNotification = {
  id: string;
  user_id: string;
  title: string | null;
  body: string | null;
  read: boolean;
  payload: {
    key?: string;
    vars?: Record<string, string | number>;
    order_id?: string;
    lifecycle_state?: LifecycleState;
  } | null;
  created_at: string;
};

export async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

/** Unread count for the home strip and the bell badge. */
export async function countUnreadNotifications(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("read", false)
    .limit(100);
  if (error) throw error;
  return (data ?? []).length;
}

/**
 * Mark everything read. Scoped to the caller's own rows — the RLS policy
 * enforces this too, but sending the filter keeps the intent explicit rather
 * than relying on the database to catch a mistake.
 */
export async function markAllRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);
  if (error) throw error;
}
