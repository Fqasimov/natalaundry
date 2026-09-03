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
import { StatusBadge } from "@/components/StatusBadge";
import { brand, colors, font, money, radius, type } from "@/theme/tokens";
import { useAuth } from "@/lib/auth-context";
import { reportError } from "@/lib/errors";
import { useProfile } from "@/lib/profile";
import { useI18n } from "@/lib/language-context";
import { fetchAvailableOrdersForCourier, fetchMyCourierOrders, fetchMyOrders } from "@/lib/orders";
import type { Order } from "@/types/database";

type CourierTab = "available" | "mine";

/**
 * Order history. Reached from the profile rather than the tab bar, which is
 * why it is not one of the three tabs.
 */
export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { profile } = useProfile();
  const { t } = useI18n();
  const isCourier = profile?.role === "courier";

  const [courierTab, setCourierTab] = useState<CourierTab>("available");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      let data: Order[];
      if (isCourier && session?.user.id) {
        data =
          courierTab === "available"
            ? await fetchAvailableOrdersForCourier()
            : await fetchMyCourierOrders(session.user.id);
      } else {
        data = await fetchMyOrders();
      }
      setOrders(data);
    } catch (e) {
      setLoadError(reportError("orders.list", e));
    }
  }, [isCourier, courierTab, session?.user.id]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={[s.root, { paddingTop: insets.top + 4 }]}>
      <ScreenHeader
        title={isCourier ? t("courierJobs") : t("pastOrders")}
        backFallback="/(tabs)/profile"
      />

      {isCourier ? (
        <View style={s.segmented}>
          {(["available", "mine"] as CourierTab[]).map((key) => (
            <Pressable
              key={key}
              style={[s.segment, courierTab === key && s.segmentActive]}
              onPress={() => setCourierTab(key)}
            >
              <Text
                style={[s.segmentLabel, courierTab === key && s.segmentLabelActive]}
                numberOfLines={1}
              >
                {key === "available" ? t("courierAvailable") : t("courierActive")}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {loadError ? (
        <Text style={s.error}>{loadError}</Text>
      ) : !orders ? (
        <View style={s.center}>
          <ActivityIndicator color={brand.moonstone} />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 32 }]}
          data={orders}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={brand.moonstone} />
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <AppIcon name="mci:hanger" size={30} color={brand.moonstone} />
              <Text style={s.emptyLabel}>{t("noOrders")}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={s.card} onPress={() => router.push(`/order/${item.id}`)}>
              <View style={s.cardTop}>
                <Text style={s.orderNo} numberOfLines={1}>
                  {t("orderNo", { no: item.order_no ?? "—" })}
                </Text>
                <StatusBadge status={item.status} />
              </View>
              <Text style={s.address} numberOfLines={2}>
                {item.address ?? "—"}
              </Text>
              <View style={s.cardBottom}>
                <Text style={s.slot} numberOfLines={1}>
                  {item.collection_time}
                </Text>
                <Text style={s.total}>{money(item.total)}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: {
    ...type.caption,
    margin: 20,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  segmented: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    paddingVertical: 9,
    backgroundColor: brand.surfaceAlt,
  },
  segmentActive: { backgroundColor: brand.midnight },
  segmentLabel: { fontFamily: font.semibold, fontSize: 13, color: brand.onSoftMuted },
  segmentLabelActive: { color: colors.textInverse },

  list: { paddingHorizontal: 20, gap: 12 },
  empty: { alignItems: "center", gap: 10, marginTop: 56 },
  emptyLabel: { ...type.body, color: colors.textSecondary },

  card: {
    backgroundColor: brand.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: brand.border,
    padding: 16,
    gap: 6,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  orderNo: { flexShrink: 1, fontFamily: font.semibold, fontSize: 14, color: colors.textPrimary },
  address: { ...type.body, color: colors.textSecondary },
  cardBottom: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: 2,
  },
  slot: { ...type.caption, flex: 1, marginRight: 10, color: colors.textSecondary },
  total: { flexShrink: 0, fontFamily: font.bold, fontSize: 16, color: colors.textPrimary },
});
