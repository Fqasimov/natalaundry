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
import { AppLogo } from "@/components/AppLogo";
import { brand, font, money, radius, type } from "@/theme/tokens";
import { settingsUi } from "@/components/SettingsScaffold";
import { useAuth } from "@/lib/auth-context";
import { reportError } from "@/lib/errors";
import { useProfile } from "@/lib/profile";
import { useI18n } from "@/lib/language-context";
import type { Language } from "@/lib/i18n";
import { useCart } from "@/lib/state/cart";
import { fetchLastCompletedOrder, fetchOrderItems } from "@/lib/orders";
import { useErrorAlert } from "@/lib/alerts";

// Profile rebuilt to the structure of the Laravel/React reference build:
// a header block, then Orders / Membership & balance / Account / Support
// sections of tappable rows.
//
// Follows the shipped design: a pale surface, a plain header with a settings
// affordance, the identity block laid out horizontally, and rows carrying
// outline icons rather than filled bubbles. The palette is now the coastal
// `brand` one, shared with the sub-screens this opens into.

// The profile screen and its sub-screens shared an identical palette
// object, duplicated in two files. It now lives once, in SettingsScaffold,
// so the two cannot drift apart.
const ui = settingsUi;

/** Shown as the value on the language row. */
const LANGUAGE_LABEL: Record<Language, string> = {
  az: "Azərbaycan",
  ru: "Русский",
  en: "English",
};

type RowProps = {
  icon: IconName;
  label: string;
  value?: string;
  danger?: boolean;
  onPress?: () => void;
};

function Row({ icon, label, value, danger, onPress }: RowProps) {
  const tone = danger ? ui.danger : ui.accent;
  return (
    <Pressable
      style={({ pressed }) => [s.row, pressed && s.rowPressed]}
      onPress={onPress}
    >
      <AppIcon name={icon} size={22} color={tone} />
      <Text style={[s.rowLabel, danger && { color: ui.danger }]} numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text style={s.rowValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={danger ? ui.danger : ui.accent} />
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
  const { t, lang } = useI18n();
  const { add, setQty, reset } = useCart();
  const [notice, setNotice] = useState<string | null>(null);
  // Failures interrupt rather than sitting in red under the button.
  useErrorAlert(notice);
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
      setNotice(reportError("profile", e));
    } finally {
      setRepeating(false);
    }
  }, [add, setQty, reset, t]);

  if (isLoading || !profile) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={ui.ink} />
      </View>
    );
  }

  const email = profile.email ?? session?.user.email ?? null;

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[s.header, { paddingTop: insets.top + 10 }]}>
          <Text style={s.title}>{t("profile")}</Text>
          <Pressable
            style={s.gear}
            hitSlop={10}
            onPress={() => router.push("/profile/personal")}
            accessibilityLabel={t("settings")}
          >
            <Ionicons name="settings-outline" size={20} color={ui.accent} />
          </Pressable>
        </View>

        {/* Identity reads left-to-right: mark, then name over the contact
            lines, matching the shipped design. */}
        <View style={s.identity}>
          <AppLogo size={92} />
          <View style={s.credentials}>
            <Text style={s.name} numberOfLines={1}>
              {profile.name?.trim() || "—"}
            </Text>
            {profile.phone ? (
              <Text style={s.contact} numberOfLines={1}>{profile.phone}</Text>
            ) : null}
            {email ? (
              <Text style={s.contact} numberOfLines={1}>{email}</Text>
            ) : null}
          </View>
        </View>

        <View style={s.body}>
          

          <Section title={t("profileSectionOrders")}>
            <Row
              icon="mci:refresh"
              label={t("repeatLastOrder")}
              value={repeating ? "…" : undefined}
              onPress={repeatLastOrder}
            />
            <View style={s.divider} />
            <Row
              icon="mci:clock-outline"
              label={t("pastOrders")}
              onPress={() => router.push("/orders")}
            />
          </Section>

          <Section title={t("profileSectionMembership")}>
            <Row
              icon="mci:wallet-outline"
              label={t("myBalance")}
              value={`${(profile.wallet_balance ?? 0).toFixed(2)} ${t("currencyCode")}`}
              onPress={() => router.push("/wallet")}
            />
            <View style={s.divider} />
            <Row
              icon="mci:shield-check-outline"
              label={t("mySubscription")}
              value={
                profile.is_subscribed ? t("subscriptionName") : t("subscriptionInactive")
              }
              onPress={() => router.push("/profile/subscription")}
            />
            <View style={s.divider} />
            <Row
              icon="mci:gift-outline"
              label={t("inviteFriend")}
              value={t("inviteFriendValue")}
              onPress={() => router.push("/profile/referral")}
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
              onPress={() => router.push("/profile/addresses")}
            />
            <View style={s.divider} />
            <Row
              icon="mci:credit-card-outline"
              label={t("paymentMethods")}
              onPress={() => router.push("/profile/payment")}
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
              onPress={() => router.push("/profile/support")}
            />
          </Section>

          {/* Language and sign-out share a trailing card, as in the design —
              sign-out is a row here rather than a button so it doesn't read as
              the screen's primary action. */}
          <View style={s.card}>
            <Row
              icon="mci:web"
              label={t("appLanguage")}
              value={LANGUAGE_LABEL[lang]}
              onPress={() => router.push("/profile/language")}
            />
            <View style={s.divider} />
            <Row icon="mci:logout" label={t("signOut")} danger onPress={signOut} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: ui.bg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ui.bg,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  title: {
    fontFamily: font.extrabold,
    fontSize: 30,
    letterSpacing: -0.6,
    color: ui.ink,
  },
  gear: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: ui.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 22,
  },
  credentials: { flex: 1 },
  name: {
    fontFamily: font.extrabold,
    fontSize: 24,
    letterSpacing: -0.4,
    color: ui.ink,
    marginBottom: 4,
  },
  contact: {
    fontFamily: font.regular,
    fontSize: 14.5,
    lineHeight: 21,
    color: ui.inkSoft,
  },

  body: { paddingHorizontal: 16, gap: 22 },
  notice: {
    ...type.caption,
    color: ui.accent,
    backgroundColor: ui.accentSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  section: { gap: 10 },
  sectionTitle: {
    fontFamily: font.bold,
    fontSize: 12.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: ui.inkSoft,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: ui.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ui.border,
    overflow: "hidden",
  },
  divider: { height: 1, backgroundColor: ui.divider, marginLeft: 56 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 17,
  },
  rowPressed: { backgroundColor: brand.aliceBlue },
  rowLabel: {
    flex: 1,
    fontFamily: font.bold,
    fontSize: 16,
    color: ui.ink,
  },
  // flexShrink + maxWidth: without them a long value (Russian subscription
  // and balance strings are the worst offenders) keeps its full intrinsic
  // width, squashing the label to nothing and pushing the chevron off the
  // card. Capping it at half the row makes the two share the space.
  rowValue: {
    flexShrink: 1,
    maxWidth: "50%",
    fontFamily: font.medium,
    fontSize: 14,
    color: ui.inkSoft,
    textAlign: "right",
  },
});
