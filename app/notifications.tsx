import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon } from "@/components/AppIcon";
import { ScreenHeader } from "@/components/ui";
import { brand, colors, font, radius, type } from "@/theme/tokens";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/language-context";
import {
  fetchNotifications,
  markAllRead,
  readBody,
  readPayload,
  type AppNotification,
} from "@/lib/notifications";
import { LIFECYCLE_LABEL, type LifecycleState } from "@/lib/lifecycle";

/**
 * The notification inbox.
 *
 * Rows carry an i18n key plus vars, so the message is rendered in the reader's
 * own language here rather than shown in whatever language it was written in.
 * `body` is the pre-rendered Azerbaijani fallback for rows that predate the
 * key, and for channels that cannot translate.
 */
export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { t } = useI18n();

  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const userId = session?.user.id ?? null;

  const load = useCallback(async () => {
    if (!userId) {
      setItems([]);
      return;
    }
    try {
      setItems(await fetchNotifications(userId));
    } catch {
      setItems([]);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const readAll = async () => {
    if (!userId) return;
    // Optimistic: the list is already on screen and the write is small, so
    // waiting on the round trip would just make the tap feel slow.
    setItems((prev) => prev?.map((n) => ({ ...n, read: true })) ?? prev);
    try {
      await markAllRead(userId);
    } catch {
      await load();
    }
  };

  const unread = (items ?? []).filter((n) => !n.read).length;

  /**
   * What this notification says, from whichever source actually has it.
   *
   * Every step here exists because the one above it can be missing. The live
   * `notifications` table predates this rebuild and only `id`/`user_id` were
   * ever confirmed (SCHEMA_NOTES.md), so a row can arrive with no `payload`
   * and no `body` at all — which is exactly how the inbox ended up listing
   * rows with no text in them. The last two steps mean a row always says
   * *something*, even when the message column is one this app has never
   * heard of.
   */
  const label = (n: AppNotification): string => {
    const payload = readPayload(n);

    // 1. The i18n key, so the message renders in the reader's language.
    const key = payload?.key;
    if (key) {
      const translated = t(key as never, payload?.vars);
      // translate() echoes the key back when it does not know it; that is not
      // something to show a customer.
      if (translated && translated !== key) return translated;
    }

    // 2. Whatever prose the row carries, under any of the names it might use.
    const body = readBody(n);
    if (body) return body;

    // 3. The lifecycle state it refers to, which is itself translated copy.
    const state = payload?.lifecycle_state as LifecycleState | undefined;
    if (state && LIFECYCLE_LABEL[state]) return t(LIFECYCLE_LABEL[state]);

    // 4. The row's own title, then a generic line. Never an empty string.
    if (n.title && n.title.trim() !== "") return n.title;
    return t("notificationsUntitled");
  };

  return (
    <View style={[s.root, { paddingTop: insets.top + 4 }]}>
      <ScreenHeader
        title={t("notificationsTitle")}
        rightLabel={unread > 0 ? t("markAllRead") : undefined}
        onRightPress={unread > 0 ? readAll : undefined}
        backFallback="/(tabs)"
      />

      {!items ? (
        <View style={s.center}>
          <ActivityIndicator color={brand.moonstoneInk} />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 32 }]}
          data={items}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={brand.moonstoneInk} />
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <AppIcon name="ion:notifications-outline" size={30} color={brand.onSoftMuted} />
              <Text style={s.emptyLabel}>{t("notificationsNone")}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const orderId = readPayload(item)?.order_id;
            return (
              <Pressable
                style={[s.card, !item.read && s.cardUnread]}
                disabled={!orderId}
                onPress={() => orderId && router.push(`/order/${orderId}`)}
              >
                <View style={[s.dot, item.read && s.dotRead]} />
                <View style={s.cardBody}>
                  <Text style={s.message}>{label(item)}</Text>
                  <Text style={s.time}>
                    {new Date(item.created_at).toLocaleString(undefined, {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
                {orderId ? (
                  <AppIcon name="ion:chevron-forward" size={16} color={brand.onSoftMuted} />
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 20, gap: 10 },
  empty: { alignItems: "center", gap: 10, marginTop: 56 },
  emptyLabel: { ...type.body, color: brand.onSoftMuted },

  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: brand.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: brand.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardUnread: { borderColor: brand.moonstoneInk },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: brand.moonstoneInk },
  dotRead: { backgroundColor: brand.border },
  cardBody: { flex: 1, gap: 3 },
  message: { fontFamily: font.medium, fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  time: { ...type.caption, color: brand.onSoftMuted },
});
