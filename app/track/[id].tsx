import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Linking,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/components/ui";
import { TrackingMap } from "@/components/TrackingMap";
import { colors, font, radius, type } from "@/theme/tokens";
import { useI18n } from "@/lib/language-context";
import { fetchOrder } from "@/lib/orders";
import {
  fetchLatestLocation,
  fetchOrderTimeline,
  isFixStale,
  TRACK_POLL_MS,
} from "@/lib/tracking";
import {
  LIFECYCLE_LABEL,
  LIFECYCLE_STATES,
  isTracking,
  stepIndex,
  type LifecycleState,
} from "@/lib/lifecycle";
import { hasCoordinates } from "@/lib/navigation-links";
import type { CourierLocation, Order, OrderStatusLog } from "@/types/database";

/**
 * Customer tracking: where the order is in the flow, and where the courier is.
 *
 * Polls only while the order is actually en route — the rest of the time the
 * courier isn't broadcasting, so asking repeatedly would burn battery and
 * requests for a value that cannot change.
 */
export default function TrackOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();

  const [order, setOrder] = useState<Order | null>(null);
  const [logs, setLogs] = useState<OrderStatusLog[]>([]);
  const [fix, setFix] = useState<CourierLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadOrder = useCallback(async () => {
    if (!id) return;
    try {
      const [o, l] = await Promise.all([fetchOrder(id), fetchOrderTimeline(id)]);
      setOrder(o);
      setLogs(l);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const live = isTracking(order?.lifecycle_state);

  // The position poll is separate from the order load: it runs often and only
  // while en route, whereas the order itself changes a handful of times.
  useEffect(() => {
    if (!id || !live) {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      return;
    }

    let cancelled = false;
    const tick = async () => {
      try {
        const latest = await fetchLatestLocation(id);
        if (!cancelled) setFix(latest);
      } catch {
        // Keep the last known position on screen rather than dropping the
        // marker — a missed poll is not the courier disappearing.
      }
    };

    tick();
    timer.current = setInterval(tick, TRACK_POLL_MS);
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [id, live]);

  // While en route the order's own state is also moving, so refresh it at a
  // slower cadence to catch the transition out of tracking.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(loadOrder, TRACK_POLL_MS * 4);
    return () => clearInterval(t);
  }, [live, loadOrder]);

  if (error && !order) {
    return (
      <View style={s.center}>
        <Text style={s.error}>{error}</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const current = order.lifecycle_state ?? "order_placed";
  const currentIndex = stepIndex(current) ?? 0;
  const stale = isFixStale(fix);
  const courierPoint = fix ? { lat: fix.lat, lng: fix.lng } : null;
  const destination = hasCoordinates(order.address_lat, order.address_lng)
    ? { lat: order.address_lat as number, lng: order.address_lng as number }
    : null;

  // When a step happened, taken from the audit trail rather than guessed.
  const reachedAt = new Map(logs.map((l) => [l.to_state, l.created_at]));

  return (
    <View style={[s.root, { paddingTop: insets.top + 4 }]}>
      <ScreenHeader title={t("trackingTitle")} backFallback="/(tabs)" />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 32 }]}>
        <View style={s.statusCard}>
          <View style={s.statusRow}>
            <Text style={s.statusLabel}>
              {t(LIFECYCLE_LABEL[current as LifecycleState] ?? "stateOrderPlaced")}
            </Text>
            {live ? (
              <View style={[s.livePill, stale && s.stalePill]}>
                <View style={[s.liveDot, stale && s.staleDot]} />
                <Text style={[s.liveLabel, stale && s.staleLabel]}>
                  {stale ? t("trackingStale") : t("trackingLive")}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={s.orderNo}>{t("orderNo", { no: order.order_no ?? "—" })}</Text>
        </View>

        {live ? (
          <TrackingMap
            courier={courierPoint}
            destination={destination}
            heading={fix?.heading}
          />
        ) : (
          <View style={s.offlineCard}>
            <Ionicons name="navigate-outline" size={18} color={colors.textSecondary} />
            <Text style={s.offlineLabel}>{t("trackingOffline")}</Text>
          </View>
        )}

        <Text style={s.sectionTitle}>{t("orderTimeline")}</Text>
        <View style={s.timeline}>
          {LIFECYCLE_STATES.map((state, i) => {
            const done = i <= currentIndex;
            const isNow = i === currentIndex;
            const at = reachedAt.get(state);
            return (
              <View key={state} style={s.step}>
                <View style={s.stepRail}>
                  <View style={[s.stepDot, done && s.stepDotDone, isNow && s.stepDotNow]}>
                    {done && !isNow ? (
                      <Ionicons name="checkmark" size={11} color={colors.textInverse} />
                    ) : null}
                  </View>
                  {i < LIFECYCLE_STATES.length - 1 ? (
                    <View style={[s.stepLine, i < currentIndex && s.stepLineDone]} />
                  ) : null}
                </View>
                <View style={s.stepBody}>
                  <Text style={[s.stepLabel, done && s.stepLabelDone]}>
                    {t(LIFECYCLE_LABEL[state])}
                  </Text>
                  {at ? (
                    <Text style={s.stepTime}>
                      {new Date(at).toLocaleString(undefined, {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
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
    padding: 24,
  },
  body: { paddingHorizontal: 20, gap: 16 },
  error: { ...type.body, color: colors.danger, textAlign: "center" },

  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusLabel: { flex: 1, fontFamily: font.bold, fontSize: 18, color: colors.textPrimary },
  orderNo: { ...type.caption, color: colors.textSecondary, marginTop: 4 },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.successSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  stalePill: { backgroundColor: colors.surfaceAlt },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  staleDot: { backgroundColor: colors.textSecondary },
  liveLabel: { fontFamily: font.bold, fontSize: 11, color: colors.success },
  staleLabel: { color: colors.textSecondary },

  offlineCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: 16,
  },
  offlineLabel: { ...type.body, flex: 1, color: colors.textSecondary },

  sectionTitle: {
    fontFamily: font.bold,
    fontSize: 15,
    color: colors.textPrimary,
    marginTop: 4,
  },
  timeline: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  step: { flexDirection: "row", gap: 12 },
  stepRail: { alignItems: "center", width: 18 },
  stepDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepDotNow: { backgroundColor: colors.accent, borderColor: colors.accent },
  stepLine: { flex: 1, width: 2, minHeight: 22, backgroundColor: colors.border },
  stepLineDone: { backgroundColor: colors.primary },
  stepBody: { flex: 1, paddingBottom: 14 },
  stepLabel: { fontFamily: font.medium, fontSize: 14, color: colors.textSecondary },
  stepLabelDone: { fontFamily: font.semibold, color: colors.textPrimary },
  stepTime: { ...type.caption, color: colors.textSecondary, marginTop: 2 },
});
