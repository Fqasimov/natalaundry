import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon, type IconName } from "@/components/AppIcon";
import { colors, font, money, radius, type } from "@/theme/tokens";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/profile";
import { useI18n } from "@/lib/language-context";
import { useCart } from "@/lib/state/cart";
import { tierFor, nextTierFor, pointsToNextTier } from "@/lib/membership";
import { fetchLastCompletedOrder, fetchOrderItems } from "@/lib/orders";

// Profile rebuilt to the structure of the Laravel/React reference build:
// a header block, then Orders / Membership & balance / Account / Support
// sections of tappable rows.
//
// The hero keeps the app's blue gradient so the screen still belongs to the
// product; everything below it is monochrome, using the local palette here so
// the ivory/blue/service tints stay untouched on every other screen. Hierarchy
// in the body comes from weight and grey level rather than hue.
//
// Rows whose destination screen doesn't exist yet are marked "Tezliklə"
// rather than wired to a dead route, so nothing silently does nothing.

const mono = {
  bg: "#FFFFFF",
  surface: "#FFFFFF",
  bubble: "#F2F2F3",
  border: "#E4E4E6",
  divider: "#EFEFF1",
  ink: "#111112",
  inkSoft: "#6E6E73",
  inkFaint: "#A1A1A6",
  inverse: "#FFFFFF",
} as const;

type RowProps = {
  icon: IconName;
  label: string;
  value?: string;
  soon?: boolean;
  onPress?: () => void;
};

function Row({ icon, label, value, soon, onPress }: RowProps) {
  const { t } = useI18n();
  return (
    <Pressable
      style={({ pressed }) => [s.row, pressed && !soon && s.rowPressed]}
      onPress={soon ? undefined : onPress}
      disabled={soon}
    >
      <View style={s.rowIcon}>
        <AppIcon name={icon} size={19} color={soon ? mono.inkFaint : mono.ink} />
      </View>
      <Text style={[s.rowLabel, soon && s.rowLabelMuted]} numberOfLines={1}>
        {label}
      </Text>
      {soon ? (
        <View style={s.soonPill}>
          <Text style={s.soonLabel}>{t("comingSoon")}</Text>
        </View>
      ) : value ? (
        <Text style={s.rowValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      <Ionicons
        name="chevron-forward"
        size={17}
        color={soon ? mono.border : mono.inkFaint}
      />
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.card}>{children}</View>
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { session, signOut } = useAuth();
  const { profile, isLoading } = useProfile();
  const { t } = useI18n();
  const { add, setQty, reset } = useCart();
  const [notice, setNotice] = useState<string | null>(null);
  const [repeating, setRepeating] = useState(false);

  // Rebuilds a basket from the last completed order's line items. The items
  // carry their own name/price, so no catalogue lookup is needed — and a
  // stale price in the basket is harmless: the server reprices at order time.
  const repeatLastOrder = useCallback(async () => {
    setRepeating(true);
    setNotice(null);
    try {
      const last = await fetchLastCompletedOrder();
      const items = last ? await fetchOrderItems(last.id) : [];
      if (!last || items.length === 0) {
        setNotice(t("repeatOrderEmpty"));
        return;
      }
      reset();
      for (const item of items) {
        const line = {
          serviceId: item.service_id,
          itemId: item.item_id,
          name: item.item_name,
          price: item.price,
        };
        add(line);
        setQty(line.serviceId, line.itemId, item.quantity);
      }
      setNotice(t("repeatOrderAdded"));
      router.push("/checkout/schedule");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setRepeating(false);
    }
  }, [add, setQty, reset, t]);

  if (isLoading || !profile) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={mono.ink} />
      </View>
    );
  }

  const points = profile.points ?? 0;
  const tier = tierFor(points);
  const nextTier = nextTierFor(points);
  const remaining = pointsToNextTier(points);
  const email = profile.email ?? session?.user.email ?? null;

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ── */}
        <LinearGradient
          colors={[colors.heroFrom, colors.heroTo]}
          style={[s.hero, { paddingTop: insets.top + 14 }]}
        >
          <Text style={s.heroTitle}>{t("profile")}</Text>

          {/* Avatar and credentials are centred against each other, and the
              contact lines share one rhythm, so the block reads as a single
              unit instead of three loose lines beside a circle. */}
          <View style={s.identity}>
            <View style={s.avatar}>
              <Ionicons name="person" size={32} color={mono.inverse} />
            </View>
            <View style={s.credentials}>
              <Text style={s.name} numberOfLines={1}>
                {profile.name?.trim() || "—"}
              </Text>
              {profile.phone ? (
                <Text style={s.contact} numberOfLines={1}>
                  {profile.phone}
                </Text>
              ) : null}
              {email ? (
                <Text style={s.contact} numberOfLines={1}>
                  {email}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={s.tierRow}>
            <View style={s.tierBadge}>
              <AppIcon name="mci:medal-outline" size={14} color={colors.primary} />
              <Text style={s.tierName}>{tier.name}</Text>
            </View>
            <Text style={s.tierProgress} numberOfLines={2}>
              {remaining !== null && nextTier
                ? t("levelProgress", { name: nextTier.name, points: remaining })
                : t("levelMax")}
            </Text>
          </View>
        </LinearGradient>

        <View style={s.body}>
          {notice ? <Text style={s.notice}>{notice}</Text> : null}

          <Section title={t("profileSectionOrders")}>
            <Row
              icon="mci:refresh"
              label={t("repeatLastOrder")}
              value={repeating ? "…" : undefined}
              onPress={repeatLastOrder}
            />
            <View style={s.divider} />
            <Row
              icon="mci:clipboard-text-outline"
              label={t("pastOrders")}
              onPress={() => router.push("/orders")}
            />
          </Section>

          <Section title={t("profileSectionMembership")}>
            <Row
              icon="mci:wallet-outline"
              label={t("myBalance")}
              value={money(profile.wallet_balance ?? 0)}
              onPress={() => router.push("/wallet")}
            />
            <View style={s.divider} />
            <Row
              icon="mci:crown-outline"
              label={t("mySubscription")}
              value={
                profile.is_subscribed ? t("subscriptionName") : t("subscriptionInactive")
              }
              soon
            />
            <View style={s.divider} />
            <Row
              icon="mci:medal-outline"
              label={t("myLevel")}
              value={tier.name}
              soon
            />
            <View style={s.divider} />
            <Row
              icon="mci:account-multiple-plus-outline"
              label={t("inviteFriend")}
              value={t("inviteFriendValue")}
              soon
            />
          </Section>

          <Section title={t("profileSectionAccount")}>
            <Row
              icon="ion:person-outline"
              label={t("personalInfo")}
              onPress={() => router.push("/profile/personal")}
            />
            <View style={s.divider} />
            <Row
              icon="ion:location-outline"
              label={t("myAddresses")}
              soon
            />
            <View style={s.divider} />
            <Row
              icon="mci:credit-card-outline"
              label={t("paymentMethods")}
              soon
            />
            <View style={s.divider} />
            <Row
              icon="ion:notifications-outline"
              label={t("notificationsRow")}
              onPress={() => router.push("/notifications")}
            />
          </Section>

          <Section title={t("profileSectionSupport")}>
            <Row
              icon="ion:help-circle-outline"
              label={t("helpSupport")}
              soon
            />
          </Section>

          <Pressable style={s.signOut} onPress={signOut}>
            <Ionicons name="log-out-outline" size={19} color={mono.ink} />
            <Text style={s.signOutLabel}>{t("signOut")}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: mono.bg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mono.bg,
  },

  // ── Hero ──
  hero: { paddingHorizontal: 20, paddingBottom: 24 },
  heroTitle: {
    fontFamily: font.extrabold,
    fontSize: 26,
    letterSpacing: -0.4,
    color: mono.inverse,
  },
  identity: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 20 },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.20)",
    alignItems: "center",
    justifyContent: "center",
  },
  credentials: { flex: 1, justifyContent: "center" },
  name: {
    fontFamily: font.bold,
    fontSize: 18,
    lineHeight: 24,
    color: mono.inverse,
    marginBottom: 3,
  },
  contact: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(255,255,255,0.80)",
  },
  tierRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 20 },
  tierBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: mono.inverse,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  tierName: { fontFamily: font.bold, fontSize: 12.5, color: colors.primary },
  tierProgress: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 16,
    color: "rgba(255,255,255,0.80)",
  },

  // ── Body ──
  body: { paddingHorizontal: 20, paddingTop: 22, gap: 22 },
  notice: {
    ...type.caption,
    color: mono.ink,
    backgroundColor: mono.bubble,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  section: { gap: 9 },
  sectionTitle: {
    fontFamily: font.bold,
    fontSize: 15,
    letterSpacing: -0.2,
    color: mono.ink,
  },
  card: {
    backgroundColor: mono.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: mono.border,
    overflow: "hidden",
  },
  divider: { height: 1, backgroundColor: mono.divider, marginLeft: 60 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  rowPressed: { backgroundColor: mono.bubble },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: mono.bubble,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 14.5,
    color: mono.ink,
  },
  rowLabelMuted: { color: mono.inkFaint },
  rowValue: { fontFamily: font.bold, fontSize: 13.5, color: mono.inkSoft },
  soonPill: {
    backgroundColor: mono.bubble,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  soonLabel: { fontFamily: font.semibold, fontSize: 10.5, color: mono.inkFaint },

  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: mono.bg,
    borderWidth: 1,
    borderColor: mono.ink,
    borderRadius: radius.pill,
    paddingVertical: 15,
    marginTop: 2,
  },
  signOutLabel: { fontFamily: font.semibold, fontSize: 15, color: mono.ink },
});
