import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { brand, colors, font, money, radius, type } from "@/theme/tokens";
import { useAuth } from "@/lib/auth-context";
import { reportError } from "@/lib/errors";
import { useProfile } from "@/lib/profile";
import { useI18n } from "@/lib/language-context";
import {
  claimOrderAtomically,
  fetchMyActiveJob,
  fetchOfferedOrders,
  transitionOrder,
} from "@/lib/orders";
import { LIFECYCLE_LABEL, courierNextStep, isTracking } from "@/lib/lifecycle";
import { useLocationBroadcast } from "@/lib/use-location-broadcast";
import { hasCoordinates, openNavigation } from "@/lib/navigation-links";
import type { Order } from "@/types/database";

type Tab = "available" | "active";

/**
 * The courier's working screen: what has been offered to them, and the one job
 * they are currently on.
 *
 * The GPS loop is driven by the active job's lifecycle state rather than a
 * switch the courier flips, so it starts and stops on its own and can't be
 * left running after a delivery.
 */
export default function CourierDashboard() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { profile } = useProfile();
  const { t } = useI18n();

  const [tab, setTab] = useState<Tab>("available");
  const [offered, setOffered] = useState<Order[]>([]);
  const [active, setActive] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const courierId = session?.user.id ?? null;

  const load = useCallback(async () => {
    if (!courierId) return;
    try {
      const [jobs, mine] = await Promise.all([
        fetchOfferedOrders(courierId),
        fetchMyActiveJob(courierId),
      ]);
      setOffered(jobs);
      setActive(mine);
      // Land on whichever tab has something to do, but only on first load —
      // switching under the courier mid-session would be disorienting.
      setTab((prev) => (prev === "available" && mine ? "active" : prev));
    } catch (e) {
      setNotice(reportError("courier", e));
    } finally {
      setLoading(false);
    }
  }, [courierId]);

  useEffect(() => {
    load();
  }, [load]);

  const broadcast = useLocationBroadcast({
    orderId: active?.id,
    courierId,
    state: active?.lifecycle_state,
  });

  const claim = async (order: Order) => {
    if (!courierId) return;
    setBusy(true);
    setNotice(null);
    try {
      const won = await claimOrderAtomically(order.id, courierId);
      // Losing the race is an ordinary outcome, not an error: someone else was
      // simply faster, so say so plainly and refresh the list.
      setNotice(won ? null : t("orderAlreadyClaimed"));
      await load();
      if (won) setTab("active");
    } catch (e) {
      setNotice(reportError("courier", e));
    } finally {
      setBusy(false);
    }
  };

  const advance = async () => {
    if (!active) return;
    const next = courierNextStep(active.lifecycle_state);
    if (!next) return;
    setBusy(true);
    setNotice(null);
    try {
      await transitionOrder(active.id, active.lifecycle_state, next.to);
      await load();
    } catch (e) {
      setNotice(reportError("courier", e));
    } finally {
      setBusy(false);
    }
  };

  if (profile && profile.role !== "courier") {
    return (
      <View style={s.center}>
        <Text style={s.muted}>{t("courierNoActive")}</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={brand.moonstoneInk} />
      </View>
    );
  }

  const next = active ? courierNextStep(active.lifecycle_state) : null;
  const canNavigate = active && hasCoordinates(active.address_lat, active.address_lng);

  return (
    <View style={[s.root, { paddingTop: insets.top + 10 }]}>
      <View style={s.tabs}>
        {(["available", "active"] as Tab[]).map((key) => (
          <Pressable
            key={key}
            style={[s.tab, tab === key && s.tabActive]}
            onPress={() => setTab(key)}
          >
            <Text style={[s.tabLabel, tab === key && s.tabLabelActive]} numberOfLines={1}>
              {key === "available" ? t("courierAvailable") : t("courierActive")}
            </Text>
            {key === "available" && offered.length > 0 ? (
              <View style={s.tabBadge}>
                <Text style={s.tabBadgeLabel}>{offered.length}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>

      {notice ? <Text style={s.notice}>{notice}</Text> : null}

      <ScrollView
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={brand.moonstoneInk}
          />
        }
      >
        {tab === "available" ? (
          offered.length === 0 ? (
            <Text style={s.muted}>{t("courierNoAvailable")}</Text>
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
                  style={[s.primaryButton, busy && s.disabled]}
                  disabled={busy}
                  onPress={() => claim(order)}
                >
                  <Text style={s.primaryLabel}>{t("claimOrder")}</Text>
                </Pressable>
              </View>
            ))
          )
        ) : !active ? (
          <Text style={s.muted}>{t("courierNoActive")}</Text>
        ) : (
          <View style={s.card}>
            <View style={s.cardTop}>
              <Text style={s.orderNo}>{t("orderNo", { no: active.order_no ?? "—" })}</Text>
              <Text style={s.total}>{money(active.total)}</Text>
            </View>

            <Text style={s.state}>
              {t(LIFECYCLE_LABEL[active.lifecycle_state] ?? "stateOrderPlaced")}
            </Text>
            <Text style={s.address}>{active.address ?? "—"}</Text>

            {/* Location status is shown, not toggled: the loop follows the
                order's state so there is nothing for the courier to manage. */}
            {isTracking(active.lifecycle_state) ? (
              <View style={s.gpsRow}>
                <View
                  style={[
                    s.gpsDot,
                    { backgroundColor: broadcast.isSharing ? colors.success : colors.amber },
                  ]}
                />
                <Text style={s.gpsLabel}>
                  {broadcast.status === "denied"
                    ? t("locationDenied")
                    : broadcast.isSharing
                      ? t("locationSharing")
                      : t("locationSharingOff")}
                </Text>
              </View>
            ) : null}

            {canNavigate ? (
              <View style={s.navRow}>
                <Pressable
                  style={s.navButton}
                  onPress={() =>
                    openNavigation(active.address_lat!, active.address_lng!, {
                      label: active.address ?? undefined,
                    })
                  }
                >
                  <Ionicons name="logo-google" size={15} color={brand.moonstoneInk} />
                  <Text style={s.navLabel} numberOfLines={1}>
                    {t("navigateGoogle")}
                  </Text>
                </Pressable>
                <Pressable
                  style={s.navButton}
                  onPress={() =>
                    openNavigation(active.address_lat!, active.address_lng!, {
                      preferNative: true,
                      label: active.address ?? undefined,
                    })
                  }
                >
                  <Ionicons name="navigate" size={15} color={brand.moonstoneInk} />
                  <Text style={s.navLabel} numberOfLines={1}>
                    {t("navigateApp")}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {next ? (
              <Pressable
                style={[s.primaryButton, busy && s.disabled]}
                disabled={busy}
                onPress={advance}
              >
                {busy ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={s.primaryLabel}>{t(next.label)}</Text>
                )}
              </Pressable>
            ) : (
              // Waiting on the laundry or an admin — no courier action exists,
              // so show why rather than a button that would be rejected.
              <Text style={s.waiting}>
                {t(LIFECYCLE_LABEL[active.lifecycle_state] ?? "stateOrderPlaced")}
              </Text>
            )}

            <Pressable style={s.secondaryButton} onPress={() => router.push(`/order/${active.id}`)}>
              <Text style={s.secondaryLabel}>{t("viewOrder")}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: brand.background,
    padding: 24,
  },
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  tab: {
    // Each tab takes half the row rather than sizing to its label: the
    // Russian labels together were wider than a small phone.
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: brand.surfaceAlt,
  },
  tabActive: { backgroundColor: brand.moonstoneInk },
  tabLabel: { flexShrink: 1, fontFamily: font.semibold, fontSize: 13, color: brand.onSoftMuted },
  tabLabelActive: { color: colors.textInverse },
  // Amber, not moonstone: this counts unclaimed job offers, and offers are
  // first-to-claim — a courier who misses it loses the work to someone else.
  // It has to stand out against the palette rather than blend into it.
  tabBadge: {
    flexShrink: 0,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  tabBadgeLabel: { fontFamily: font.bold, fontSize: 11, color: colors.textPrimary },
  notice: {
    ...type.caption,
    marginHorizontal: 20,
    marginBottom: 8,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  body: { paddingHorizontal: 20, gap: 12 },
  muted: { ...type.body, color: brand.onSoftMuted, textAlign: "center", marginTop: 32 },
  card: {
    backgroundColor: brand.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: brand.border,
    padding: 16,
    gap: 6,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  orderNo: { flexShrink: 1, fontFamily: font.semibold, fontSize: 13, color: brand.onSoftMuted },
  total: { flexShrink: 0, fontFamily: font.bold, fontSize: 16, color: colors.textPrimary },
  state: { fontFamily: font.bold, fontSize: 18, color: colors.textPrimary, marginTop: 2 },
  address: { ...type.body, color: colors.textPrimary },
  slot: { ...type.caption, color: brand.onSoftMuted },
  waiting: { ...type.caption, color: brand.onSoftMuted, marginTop: 8, textAlign: "center" },
  gpsRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  gpsDot: { width: 8, height: 8, borderRadius: 4 },
  gpsLabel: { ...type.caption, color: brand.onSoftMuted },
  navRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  navButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: brand.moonstoneInk,
    borderRadius: radius.pill,
    paddingVertical: 11,
  },
  navLabel: { flexShrink: 1, fontFamily: font.semibold, fontSize: 13, color: brand.moonstoneInk },
  primaryButton: {
    backgroundColor: brand.moonstoneInk,
    borderRadius: radius.pill,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 12,
  },
  primaryLabel: { fontFamily: font.semibold, fontSize: 15, color: colors.textInverse },
  secondaryButton: { paddingVertical: 12, alignItems: "center" },
  secondaryLabel: { fontFamily: font.medium, fontSize: 14, color: brand.onSoftMuted },
  disabled: { opacity: 0.5 },
});
