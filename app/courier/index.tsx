import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Switch,
} from "react-native";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, money, radius, type } from "@/theme/tokens";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/profile";
import { useI18n } from "@/lib/language-context";
import {
  fetchCourierHistory,
  fetchMyActiveJob,
  fetchOrderCustomer,
  fetchOrderItems,
  transitionOrder,
} from "@/lib/orders";
import { courierNextStep } from "@/lib/lifecycle";
import { useLocationBroadcast } from "@/lib/use-location-broadcast";
import { useCourierAvailability } from "@/lib/courier-availability";
import { fetchDistanceTodayKm, summarise, type CourierStats } from "@/lib/courier-stats";
import { fetchRoadRoute, isRoutingConfigured, type Route } from "@/lib/routing";
import { reportError } from "@/lib/errors";
import { ActiveJobCard } from "@/components/courier/ActiveJobCard";
import type { Order, OrderItem } from "@/types/database";

/**
 * The courier's home: am I working, what have I done today, what am I doing now.
 *
 * Rebuilt to the supplied design. What changed is the shape, not the
 * behaviour: the shift switch, the GPS coupling, the job's items, the customer
 * call button and the road distance all survive from the previous screen —
 * they are just no longer competing with a job list for the same space, which
 * now lives in its own tab.
 */
export default function CourierHome() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { profile } = useProfile();
  const { t } = useI18n();

  const [active, setActive] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [customer, setCustomer] = useState<{ name: string | null; phone: string | null } | null>(null);
  const [stats, setStats] = useState<CourierStats | null>(null);
  const [distanceKm, setDistanceKm] = useState(0);
  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const courierId = session?.user.id ?? null;
  const availability = useCourierAvailability(courierId);

  const broadcast = useLocationBroadcast({
    orderId: active?.id,
    courierId,
    state: active?.lifecycle_state,
    // Off shift means off, GPS included.
    enabled: availability.isOnline,
  });

  const load = useCallback(async () => {
    if (!courierId) return;
    setNotice(null);
    try {
      const [mine, history, km] = await Promise.all([
        fetchMyActiveJob(courierId),
        fetchCourierHistory(courierId),
        fetchDistanceTodayKm(courierId),
      ]);
      setActive(mine);
      setStats(summarise(history));
      setDistanceKm(km);

      if (mine) {
        const [lines, who] = await Promise.all([
          fetchOrderItems(mine.id).catch(() => [] as OrderItem[]),
          fetchOrderCustomer(mine.user_id).catch(() => null),
        ]);
        setItems(lines);
        setCustomer(who);
      } else {
        setItems([]);
        setCustomer(null);
      }
    } catch (e) {
      setNotice(reportError("courier.home", e));
    } finally {
      setLoading(false);
    }
  }, [courierId]);

  useEffect(() => {
    load();
  }, [load]);

  // Road distance for the job in hand. Keyed on the job, not on position: a
  // number recomputed every few metres would spend the routing allowance on
  // something nobody reads.
  useEffect(() => {
    let cancelled = false;
    setRoute(null);
    if (!active || !isRoutingConfigured()) return;
    if (typeof active.address_lat !== "number" || typeof active.address_lng !== "number") return;

    (async () => {
      const position = await Location.getLastKnownPositionAsync().catch(() => null);
      if (cancelled || !position) return;
      const found = await fetchRoadRoute(
        { lat: position.coords.latitude, lng: position.coords.longitude },
        { lat: active.address_lat as number, lng: active.address_lng as number },
      );
      if (!cancelled) setRoute(found);
    })();

    return () => {
      cancelled = true;
    };
  }, [active?.id, active?.address_lat, active?.address_lng]);

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
      setNotice(reportError("courier.advance", e));
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

  const online = availability.isOnline;

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
      {/* Greeting and the shift badge */}
      <View style={s.header}>
        <View style={s.headerText}>
          <Text style={s.greeting}>{t("courierGreeting")}</Text>
          <Text style={s.name} numberOfLines={1}>
            {profile?.name ?? "—"}
          </Text>
        </View>
        <View style={[s.pill, online ? s.pillOn : s.pillOff]}>
          <View style={[s.pillDot, { backgroundColor: online ? colors.success : colors.textSecondary }]} />
          <Text style={[s.pillLabel, online && s.pillLabelOn]}>
            {online ? t("courierOnline") : t("courierOffline")}
          </Text>
        </View>
      </View>

      {notice ? <Text style={s.notice}>{notice}</Text> : null}

      {/* The shift card. Off it is quiet and white; on it turns blue and says
          what it is doing, which is the difference between "a switch" and
          "something is being broadcast about me right now". */}
      <View style={[s.shiftCard, online && s.shiftCardOn]}>
        <View style={s.shiftTop}>
          <Ionicons
            name={online ? "radio-outline" : "ellipse-outline"}
            size={24}
            color={online ? colors.textInverse : colors.textPrimary}
          />
          <View style={s.shiftText}>
            <Text style={[s.shiftTitle, online && s.onDark]}>
              {online ? t("courierLiveTracking") : t("courierGoOnline")}
            </Text>
            <Text style={[s.shiftSub, online && s.onDarkSoft]}>
              {online ? t("courierLiveTrackingOn") : t("courierGoOnlineHint")}
            </Text>
          </View>
          <Switch
            value={online}
            disabled={availability.busy || availability.loading}
            onValueChange={(next) => availability.setOnline(next)}
            trackColor={{ false: colors.surfaceAlt, true: "rgba(255,255,255,0.45)" }}
            thumbColor={colors.surface}
            ios_backgroundColor={colors.surfaceAlt}
          />
        </View>

        {online ? (
          <View style={s.shiftFooter}>
            <ActivityIndicator size="small" color={colors.textInverse} />
            <Text style={s.shiftFooterLabel}>
              {availability.status === "denied"
                ? t("courierLocationDenied")
                : broadcast.isSharing
                  ? t("courierBroadcasting")
                  : t("courierIdleOnShift")}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Today */}
      <Text style={s.section}>{t("courierTodayStats")}</Text>
      <View style={s.statRow}>
        <Stat
          accent={colors.success}
          icon="checkmark-done"
          value={String(stats?.jobsToday ?? 0)}
          label={t("courierStatDelivered")}
        />
        <Stat
          accent="#5B57D6"
          icon="cash-outline"
          value={money(stats?.earningsThisWeek ?? 0)}
          label={t("courierStatEarnings")}
        />
        <Stat
          accent={colors.amber}
          icon="navigate"
          value={`${distanceKm.toFixed(1)} km`}
          label={t("courierStatDistance")}
        />
      </View>

      {/* The job in hand */}
      <Text style={s.section}>{t("courierActiveDelivery")}</Text>
      {active ? (
        <ActiveJobCard
          order={active}
          items={items}
          customer={customer}
          route={route}
          sharing={broadcast.isSharing}
          busy={busy}
          onAdvance={advance}
        />
      ) : (
        <View style={s.empty}>
          <Ionicons name="car-outline" size={30} color={colors.textSecondary} />
          <Text style={s.emptyLabel}>{t("courierNoDelivery")}</Text>
        </View>
      )}
    </ScrollView>
  );
}

function Stat({
  accent,
  icon,
  value,
  label,
}: {
  accent: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
}) {
  return (
    <View style={s.stat}>
      {/* The coloured edge is the design's way of telling the three apart at a
          glance without three different card backgrounds. */}
      <View style={[s.statEdge, { backgroundColor: accent }]} />
      <View style={s.statBody}>
        <Ionicons name={icon} size={19} color={accent} />
        <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        <Text style={s.statLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
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
  body: { paddingHorizontal: 20, gap: 14 },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerText: { flexShrink: 1 },
  greeting: { ...type.body, color: colors.textSecondary },
  name: { fontFamily: font.bold, fontSize: 28, lineHeight: 34, color: colors.textPrimary },
  pill: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  pillOn: { backgroundColor: colors.successSoft },
  pillOff: { backgroundColor: colors.surfaceAlt },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillLabel: { fontFamily: font.semibold, fontSize: 13, color: colors.textSecondary },
  pillLabelOn: { color: colors.success },

  notice: {
    ...type.caption,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  shiftCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 18,
    shadowColor: "#1B1A16",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  shiftCardOn: { backgroundColor: colors.primary },
  shiftTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  shiftText: { flex: 1, gap: 2 },
  shiftTitle: { fontFamily: font.bold, fontSize: 18, color: colors.textPrimary },
  shiftSub: { ...type.body, color: colors.textSecondary },
  onDark: { color: colors.textInverse },
  onDarkSoft: { color: "rgba(255,255,255,0.86)" },
  shiftFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.28)",
  },
  shiftFooterLabel: { ...type.caption, color: "rgba(255,255,255,0.9)", flexShrink: 1 },

  section: { fontFamily: font.bold, fontSize: 19, color: colors.textPrimary, marginTop: 4 },

  statRow: { flexDirection: "row", gap: 10 },
  stat: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: "hidden",
    shadowColor: "#1B1A16",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  statEdge: { width: 4 },
  statBody: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 14, paddingHorizontal: 6 },
  statValue: { fontFamily: font.bold, fontSize: 17, color: colors.textPrimary },
  statLabel: { ...type.caption, color: colors.textSecondary },

  empty: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingVertical: 42,
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
