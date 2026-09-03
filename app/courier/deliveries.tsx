import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, money, radius, type } from "@/theme/tokens";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/language-context";
import {
  claimOrderAtomically,
  fetchCourierHistory,
  fetchOfferedOrders,
} from "@/lib/orders";
import { earningFor } from "@/lib/courier-stats";
import { shortDate } from "@/lib/dates";
import { reportError } from "@/lib/errors";
import type { Order } from "@/types/database";

/**
 * Work: what is being offered, and what has been finished.
 *
 * These belong together and away from the home tab. A courier looking at
 * either one is asking "what should I pick up next" or "what did I do", not
 * "what am I doing right now" — that is the home tab's question, and mixing
 * the three is what made the old single screen crowded.
 */
export default function CourierDeliveries() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { t, lang } = useI18n();

  const [offered, setOffered] = useState<Order[]>([]);
  const [history, setHistory] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const courierId = session?.user.id ?? null;

  const load = useCallback(async () => {
    if (!courierId) return;
    try {
      const [jobs, done] = await Promise.all([
        fetchOfferedOrders(courierId),
        fetchCourierHistory(courierId),
      ]);
      setOffered(jobs);
      setHistory(done);
    } catch (e) {
      setNotice(reportError("courier.deliveries", e));
    } finally {
      setLoading(false);
    }
  }, [courierId]);

  useEffect(() => {
    load();
  }, [load]);

  const claim = async (order: Order) => {
    if (!courierId) return;
    setBusy(true);
    setNotice(null);
    try {
      const won = await claimOrderAtomically(order.id, courierId);
      // Losing the race is ordinary, not an error: somebody was faster.
      if (!won) setNotice(t("orderAlreadyClaimed"));
      await load();
      // Won work belongs on the home tab, which is where the job is driven.
      if (won) router.replace("/courier");
    } catch (e) {
      setNotice(reportError("courier.claim", e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[s.body, { paddingTop: insets.top + 12, paddingBottom: 28 }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={colors.primary}
        />
      }
    >
      <Text style={s.title}>{t("courierTabDeliveries")}</Text>
      {notice ? <Text style={s.notice}>{notice}</Text> : null}

      <View style={s.headingRow}>
        <Text style={s.section}>{t("courierOfferedHeading")}</Text>
        {offered.length > 0 ? (
          <View style={s.count}>
            <Text style={s.countLabel}>{offered.length}</Text>
          </View>
        ) : null}
      </View>

      {offered.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="file-tray-outline" size={28} color={colors.textSecondary} />
          <Text style={s.emptyLabel}>{t("courierNoAvailable")}</Text>
        </View>
      ) : (
        offered.map((order) => (
          <View key={order.id} style={s.card}>
            <View style={s.cardTop}>
              <Text style={s.orderNo}>{t("orderNo", { no: order.order_no ?? "—" })}</Text>
              <Text style={s.total}>{money(order.total)}</Text>
            </View>
            <Text style={s.address} numberOfLines={2}>
              {order.address ?? "—"}
            </Text>
            <Text style={s.slot}>{order.collection_time}</Text>
            <Pressable
              style={[s.primary, busy && s.disabled]}
              disabled={busy}
              onPress={() => claim(order)}
            >
              <Text style={s.primaryLabel}>{t("claimOrder")}</Text>
            </Pressable>
          </View>
        ))
      )}

      <Text style={s.section}>{t("courierHistoryHeading")}</Text>
      {history.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="checkmark-done-outline" size={28} color={colors.textSecondary} />
          <Text style={s.emptyLabel}>{t("courierHistoryEmpty")}</Text>
        </View>
      ) : (
        history.map((order) => (
          <Pressable
            key={order.id}
            style={s.card}
            onPress={() => router.push(`/order/${order.id}`)}
          >
            <View style={s.cardTop}>
              <Text style={s.orderNo}>{t("orderNo", { no: order.order_no ?? "—" })}</Text>
              <Text style={s.earn}>{money(earningFor(order))}</Text>
            </View>
            <Text style={s.address} numberOfLines={1}>
              {order.address ?? "—"}
            </Text>
            <Text style={s.slot}>
              {shortDate(order.delivered_at ?? order.created_at, lang) ?? "—"} · {money(order.total)}
            </Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  body: { paddingHorizontal: 20, gap: 12 },
  title: { fontFamily: font.bold, fontSize: 28, color: colors.textPrimary },

  notice: {
    ...type.caption,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  headingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  section: { fontFamily: font.bold, fontSize: 19, color: colors.textPrimary, marginTop: 4 },
  count: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.amber,
    marginTop: 4,
  },
  countLabel: { fontFamily: font.bold, fontSize: 12, color: colors.textPrimary },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 16,
    gap: 5,
    shadowColor: "#1B1A16",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  orderNo: { ...type.caption, color: colors.textSecondary },
  total: { fontFamily: font.bold, fontSize: 17, color: colors.textPrimary },
  earn: { fontFamily: font.bold, fontSize: 16, color: colors.primary },
  address: { ...type.bodyMedium, color: colors.textPrimary },
  slot: { ...type.caption, color: colors.textSecondary },

  primary: {
    marginTop: 10,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: "center",
    backgroundColor: colors.accent,
  },
  primaryLabel: { fontFamily: font.bold, fontSize: 15, color: colors.textInverse },
  disabled: { opacity: 0.6 },

  empty: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingVertical: 34,
    alignItems: "center",
    gap: 10,
    shadowColor: "#1B1A16",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  emptyLabel: { ...type.body, color: colors.textSecondary },
});
