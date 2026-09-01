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
export type NotificationPayload = {
  key?: string;
  vars?: Record<string, string | number>;
  order_id?: string;
  lifecycle_state?: LifecycleState;
} | null;

export type AppNotification = {
  id: string;
  user_id: string;
  title: string | null;
  body: string | null;
  read: boolean;
  payload: NotificationPayload;
  created_at: string;
  // The live `notifications` table predates this rebuild and only `id` and
  // `user_id` were ever recovered from the policy dump (see SCHEMA_NOTES.md),
  // so rows can carry the message under a different name. These are the
  // plausible alternatives, read as a fallback rather than assumed.
  message?: string | null;
  text?: string | null;
  content?: string | null;
  data?: unknown;
};

/**
 * `payload` as an object, whatever shape it arrived in.
 *
 * A `jsonb` column comes back parsed; a `text` column comes back as a string,
 * and `payload?.key` on a string is silently undefined — which is how a row
 * with a perfectly good key renders as nothing at all.
 */
export function readPayload(n: AppNotification): NotificationPayload {
  const raw = n.payload ?? (n.data as AppNotification["payload"]) ?? null;
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  return typeof raw === "object" ? raw : null;
}

/**
 * The first column that actually holds prose.
 *
 * Returns null rather than "" so the caller can tell "no text anywhere" from
 * "empty text", and show something sensible instead of a blank row.
 */
export function readBody(n: AppNotification): string | null {
  for (const value of [n.body, n.message, n.text, n.content]) {
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return null;
}

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
