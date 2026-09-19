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
import { useProfile } from "@/lib/profile";
import { useI18n } from "@/lib/language-context";
import { fetchCourierHistory } from "@/lib/orders";
import { reportError } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import {
  EARNINGS_ARE_PROVISIONAL,
  earningFor,
  summarise,
  type CourierStats,
} from "@/lib/courier-stats";
import { shortDate } from "@/lib/dates";
import { useErrorAlert } from "@/lib/alerts";
import type { Order } from "@/types/database";

type CourierDetails = {
  vehicle_type: string | null;
  license_plate: string | null;
  is_active: boolean | null;
};

/**
 * The courier's own page: who they are, what they have done, and the way out.
 *
 * The dashboard only ever showed the job in front of them — offered work and
 * the one active delivery — so a courier had no way to see their own record,
 * no sign-out, and no sight of the vehicle details held against their account.
 *
 * Everything here is derived from orders already visible to them under
 * "Couriers can view assigned orders". No new policy, no new table.
 */
export default function CourierProfileScreen() {
  const insets = useSafeAreaInsets();
  const { session, signOut } = useAuth();
  const { profile } = useProfile();
  const { t, lang } = useI18n();

  const [history, setHistory] = useState<Order[]>([]);
  const [details, setDetails] = useState<CourierDetails | null>(null);
  const [stats, setStats] = useState<CourierStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Failures interrupt rather than sitting in red under the button.
  useErrorAlert(notice);

  const courierId = session?.user.id ?? null;

  const load = useCallback(async () => {
    if (!courierId) return;
    setNotice(null);
    try {
      const jobs = await fetchCourierHistory(courierId);
      setHistory(jobs);
      setStats(summarise(jobs));

      const { data } = await supabase
        .from("courier_details")
        .select("vehicle_type, license_plate, is_active")
        .eq("id", courierId)
        .maybeSingle();
      setDetails((data ?? null) as CourierDetails | null);
    } catch (e) {
      setNotice(reportError("courier.profile", e));
    } finally {
      setLoading(false);
    }
  }, [courierId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const initial = (profile?.name ?? "?").trim().charAt(0).toUpperCase();

  return (
    <View style={[s.root, { paddingTop: insets.top + 10 }]}>
      {/* No back button: this is a tab now, not a pushed screen. */}
      <View style={s.header}>
        <Text style={s.headerTitle}>{t("courierProfileTitle")}</Text>
      </View>

      

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
            tintColor={colors.primary}
          />
        }
      >
        {/* Who */}
        <View style={s.identity}>
          <View style={s.avatar}>
            <Text style={s.avatarLabel}>{initial}</Text>
          </View>
          <View style={s.identityText}>
            <Text style={s.name} numberOfLines={1}>
              {profile?.name ?? "—"}
            </Text>
            <Text style={s.sub} numberOfLines={1}>
              {profile?.phone ?? profile?.email ?? "—"}
            </Text>
          </View>
        </View>

        <View style={s.card}>
          <Row label={t("courierVehicle")} value={details?.vehicle_type ?? t("courierNotSet")} />
          <View style={s.divider} />
          <Row label={t("courierPlate")} value={details?.license_plate ?? t("courierNotSet")} />
        </View>

        {/* What they have done */}
        <Text style={s.sectionHeading}>{t("courierStatsHeading")}</Text>
        <View style={s.statRow}>
          <Stat value={String(stats?.jobsToday ?? 0)} label={t("courierJobsToday")} />
          <Stat value={String(stats?.jobsThisWeek ?? 0)} label={t("courierJobsWeek")} />
          <Stat value={String(stats?.jobsAllTime ?? 0)} label={t("courierJobsTotal")} />
        </View>

        <Text style={s.sectionHeading}>{t("courierEarningsHeading")}</Text>
        <View style={s.card}>
          <Row label={t("courierEarningsWeek")} value={money(stats?.earningsThisWeek ?? 0)} strong />
          <View style={s.divider} />
          <Row label={t("courierEarningsTotal")} value={money(stats?.earningsAllTime ?? 0)} strong />
          <View style={s.divider} />
          <Row
            label={t("courierCashCollected")}
            value={money(stats?.cashCollectedAllTime ?? 0)}
          />
        </View>

        {/* Said plainly rather than hidden: the number above is a placeholder
            until the business decides how couriers are paid, and a courier
            reading their own earnings deserves to know that. */}
        {EARNINGS_ARE_PROVISIONAL ? (
          <Text style={s.provisional}>{t("courierEarningsProvisional")}</Text>
        ) : null}

        {/* History */}
        <Text style={s.sectionHeading}>{t("courierHistoryHeading")}</Text>
        {history.length === 0 ? (
          <Text style={s.muted}>{t("courierHistoryEmpty")}</Text>
        ) : (
          history.map((order) => (
            <Pressable
              key={order.id}
              style={s.job}
              onPress={() => router.push(`/order/${order.id}`)}
            >
              <View style={s.jobTop}>
                <Text style={s.jobNo}>{t("orderNo", { no: order.order_no ?? "—" })}</Text>
                <Text style={s.jobEarn}>{money(earningFor(order))}</Text>
              </View>
              <Text style={s.jobAddress} numberOfLines={1}>
                {order.address ?? "—"}
              </Text>
              <Text style={s.jobMeta}>
                {shortDate(order.delivered_at ?? order.created_at, lang) ?? "—"} ·{" "}
                {money(order.total)}
              </Text>
            </Pressable>
          ))
        )}

        <Pressable style={s.signOut} onPress={() => signOut()}>
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={s.signOutLabel}>{t("courierSignOut")}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, strong && s.rowValueStrong]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel} numberOfLines={1}>
        {label}
      </Text>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  back: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { ...type.h2, color: colors.textPrimary },
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

  identity: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 4 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.textPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLabel: { fontFamily: font.bold, fontSize: 22, color: colors.textInverse },
  identityText: { flex: 1 },
  name: { ...type.h2, color: colors.textPrimary },
  sub: { ...type.body, color: colors.textSecondary },

  sectionHeading: { ...type.eyebrow, color: colors.textSecondary, marginTop: 8 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 13,
  },
  rowLabel: { ...type.body, color: colors.textSecondary },
  rowValue: { ...type.bodyMedium, color: colors.textPrimary, flexShrink: 1, textAlign: "right" },
  rowValueStrong: { fontFamily: font.bold },
  divider: { height: 1, backgroundColor: colors.divider },

  statRow: { flexDirection: "row", gap: 10 },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    alignItems: "center",
    gap: 2,
  },
  statValue: { fontFamily: font.extrabold, fontSize: 22, color: colors.textPrimary },
  statLabel: { ...type.caption, color: colors.textSecondary },

  provisional: {
    ...type.caption,
    color: colors.textSecondary,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  job: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 4,
  },
  jobTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  jobNo: { ...type.bodyMedium, color: colors.textPrimary },
  jobEarn: { fontFamily: font.bold, fontSize: 15, color: colors.primary },
  jobAddress: { ...type.body, color: colors.textSecondary },
  jobMeta: { ...type.caption, color: colors.textSecondary },

  muted: { ...type.body, color: colors.textSecondary, textAlign: "center", paddingVertical: 16 },

  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 13,
    borderRadius: radius.lg,
    backgroundColor: colors.dangerSoft,
  },
  signOutLabel: { fontFamily: font.semibold, fontSize: 15, color: colors.danger },
});
