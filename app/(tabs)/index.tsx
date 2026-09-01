import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon, type IconName } from "@/components/AppIcon";
import { brand, colors, font, money, radius, serviceTheme } from "@/theme/tokens";
import { CATALOG } from "@/lib/catalog";
import { useCatalogCopy } from "@/lib/catalog-i18n";
import { TOPLU_DEPOSIT } from "@/lib/toplu";
import { useI18n } from "@/lib/language-context";
import { LANGUAGES, type Language } from "@/lib/i18n";
import { useCart } from "@/lib/state/cart";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/profile";
import { fetchActiveOrder, hasAnyOrder } from "@/lib/tracking";
import { fetchLastCompletedOrder, fetchOrderItems } from "@/lib/orders";
import { countUnreadNotifications } from "@/lib/notifications";
import { LIFECYCLE_LABEL, stepIndex, LIFECYCLE_STATES } from "@/lib/lifecycle";
import { FIRST_ORDER_CODE } from "@/lib/promo";
import type { Order } from "@/types/database";

// ─── Service design tokens ──────────────────────────────────────────────────
// The bento grid used to give every service its own hue (periwinkle, peach,
// taupe, cyan, pink). Restyled onto the coastal palette, the five tiles are
// separated by *value* instead — Light Blue, Alice Blue, Timberwolf and the
// blends between them — with the icon discs alternating Midnight Green and
// Moonstone so adjacent cards never repeat. `fg` is the card's own accent, used
// by its "Bax →" label and chevron.
//
// This stays local to the home screen: the global `serviceTheme` still drives
// the catalogue and checkout screens, which are outside the restyle.
const SERVICE_THEME: Record<
  string,
  { bg: string; iconBg: string; iconFg: string; fg: string }
> = {
  dry_cleaning: { bg: brand.lightBlue,      iconBg: brand.midnight,  iconFg: "#FFFFFF", fg: brand.midnight },
  ironing:      { bg: brand.moonstoneSoft,  iconBg: brand.moonstone, iconFg: "#FFFFFF", fg: brand.midnight },
  shoes:        { bg: brand.timberwolf,     iconBg: brand.midnight,  iconFg: "#FFFFFF", fg: brand.midnight },
  bedding:      { bg: brand.lightBlueSoft,  iconBg: brand.moonstone, iconFg: "#FFFFFF", fg: brand.midnight },
  bags:         { bg: brand.timberwolfSoft, iconBg: brand.midnight,  iconFg: "#FFFFFF", fg: brand.midnight },
  toplu:        { bg: brand.moonstoneSoft,  iconBg: "#FFFFFF",       iconFg: brand.midnight, fg: brand.midnight },
};

// ─── Animated press card ─────────────────────────────────────────────────────
function PressCard({
  onPress,
  style,
  contentStyle,
  children,
}: {
  onPress: () => void;
  style?: object;
  contentStyle?: object;
  children: React.ReactNode;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () =>
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 40,
      bounciness: 4,
    }).start();

  const handlePressOut = () =>
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 6,
    }).start(() => onPress());

  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[{ flex: 1 }, contentStyle]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

// ─── Service icon ─────────────────────────────────────────────────────────────
function ServiceIcon({
  icon,
  bg,
  fg,
  size = 46,
}: {
  icon: IconName;
  bg: string;
  fg: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AppIcon
        name={icon}
        size={size * 0.52}
        color={fg}
      />
    </View>
  );
}

// ─── Home screen ─────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { t, lang, setLang } = useI18n();
  const { session } = useAuth();
  const { profile } = useProfile();
  const { add, setQty, reset } = useCart();
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [ordered, setOrdered] = useState<boolean | null>(null);
  const [unread, setUnread] = useState(0);
  const [canRepeat, setCanRepeat] = useState(false);
  const [repeating, setRepeating] = useState(false);

  // Refreshed whenever the screen regains focus rather than on an interval:
  // the hero only has to be right when someone is looking at it, and polling
  // here would keep a request in flight for the whole session.
  const refresh = useCallback(async () => {
    const userId = session?.user.id;
    if (!userId) return;
    try {
      const [order, has, unreadCount, last] = await Promise.all([
        fetchActiveOrder(userId),
        hasAnyOrder(userId),
        countUnreadNotifications(userId),
        fetchLastCompletedOrder(),
      ]);
      setActiveOrder(order);
      setOrdered(has);
      setUnread(unreadCount);
      setCanRepeat(last !== null);
    } catch {
      // A failed refresh leaves the last known state on screen; the hero is
      // informational, so a transient error shouldn't blank it or interrupt.
    }
  }, [session?.user.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Rebuilds the basket from the last completed order and jumps to checkout.
  // Items carry their own name and price, so no catalogue lookup is needed —
  // and a stale price is harmless, since the server reprices at order time.
  const repeatLastOrder = useCallback(async () => {
    setRepeating(true);
    try {
      const last = await fetchLastCompletedOrder();
      const items = last ? await fetchOrderItems(last.id) : [];
      if (items.length === 0) return;
      reset();
      for (const item of items) {
        add({
          serviceId: item.service_id,
          itemId: item.item_id,
          name: item.item_name,
          price: item.price,
        });
        setQty(item.service_id, item.item_id, item.quantity);
      }
      router.push("/checkout/schedule");
    } catch {
      // Leave the hero as it is; the customer can still order normally.
    } finally {
      setRepeating(false);
    }
  }, [add, setQty, reset]);

  // Only the given name — "Salam, Məhəmməd" reads better than the full name.
  const firstName = profile?.name?.trim().split(/\s+/)[0] ?? "";
  // Held back until the check resolves, so it can't flash for a returning
  // customer on a slow connection.
  const showPromo = ordered === false;

  const [feat, ironing, shoes, bedding, bags] = CATALOG;
  const copy = useCatalogCopy();
  const featTheme  = SERVICE_THEME.dry_cleaning;
  const ironTheme  = SERVICE_THEME.ironing;
  const shoeTheme  = SERVICE_THEME.shoes;
  const bedTheme   = SERVICE_THEME.bedding;
  const bagTheme   = SERVICE_THEME.bags;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero: greeting, the welcome offer, and the live order ── */}
        <LinearGradient
          colors={[brand.heroFrom, brand.heroTo]}
          style={[styles.hero, { paddingTop: insets.top + 12 }]}
        >
          <View style={styles.heroTopRow}>
            <View style={styles.langSwitch}>
              {LANGUAGES.map((code: Language) => {
                const active = code === lang;
                return (
                  <Pressable
                    key={code}
                    onPress={() => setLang(code)}
                    style={[styles.langPill, active && styles.langPillActive]}
                  >
                    <Text
                      style={[styles.langLabel, active && styles.langLabelActive]}
                    >
                      {code.toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              style={styles.bell}
              hitSlop={10}
              onPress={() => router.push("/notifications")}
            >
              <Ionicons
                name="notifications-outline"
                size={20}
                color={colors.textInverse}
              />
            </Pressable>
          </View>

          <Text style={styles.brand}>{t("brand")}</Text>
          <Text style={styles.greeting}>
            {firstName ? t("greeting", { name: firstName }) : t("greetingNoName")} 👋
          </Text>

          {/* Inbox state, so the bell isn't the only way to know. Shows the
              reassuring "nothing unread" line rather than hiding when empty —
              an absent strip reads as a loading failure. */}
          <Pressable style={styles.inbox} onPress={() => router.push("/notifications")}>
            <Ionicons
              name={unread > 0 ? "mail-unread" : "checkmark-circle"}
              size={18}
              color={unread > 0 ? brand.lightBlue : brand.onDarkFaint}
            />
            <Text style={styles.inboxLabel} numberOfLines={2}>
              {unread > 0 ? t("unreadCount", { count: unread }) : t("notificationsEmpty")}
            </Text>
          </Pressable>

          {/* The welcome offer, shown only until the first order exists. It
              isn't typed in anywhere — the server applies it automatically —
              so this is an announcement, not an input. */}
          {showPromo ? (
            <View style={styles.promoCard}>
              <View style={styles.promoIcon}>
                <AppIcon name="mci:sale" size={22} color={brand.midnight} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.promoTitleRow}>
                  <Text style={styles.promoTitle} numberOfLines={2}>
                    {t("firstOrderPromoTitle")}
                  </Text>
                  <View style={styles.promoBadge}>
                    <Text style={styles.promoBadgeLabel}>{t("firstOrderPromoBadge")}</Text>
                  </View>
                </View>
                <Text style={styles.promoBody}>
                  {t("firstOrderPromoBody", { code: FIRST_ORDER_CODE })}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Live order: status, progress and a way into tracking. */}
          {activeOrder ? (
            <Pressable
              style={styles.orderCard}
              onPress={() => router.push(`/track/${activeOrder.id}`)}
            >
              <View style={styles.orderTopRow}>
                <Text style={styles.heroOrderLabel} numberOfLines={1}>
                  {t("activeOrder")}
                </Text>
                <Text style={styles.orderNo} numberOfLines={1}>
                  {t("orderNo", { no: activeOrder.order_no ?? "—" })}
                </Text>
              </View>
              <Text style={styles.orderState} numberOfLines={2}>
                {t(LIFECYCLE_LABEL[activeOrder.lifecycle_state] ?? "stateOrderPlaced")}
              </Text>

              <View style={styles.progressTrack}>
                {LIFECYCLE_STATES.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.progressSegment,
                      i <= (stepIndex(activeOrder.lifecycle_state) ?? 0) && styles.progressSegmentDone,
                    ]}
                  />
                ))}
              </View>

              <View style={styles.orderActionRow}>
                <Text style={styles.orderAction}>{t("trackOrder")}</Text>
                <Ionicons name="arrow-forward" size={15} color={colors.textInverse} />
              </View>
            </Pressable>
          ) : (
            <View style={styles.emptyOrderCard}>
              <Ionicons name="cube-outline" size={20} color="rgba(255,255,255,0.9)" />
              <View style={{ flex: 1 }}>
                <Text style={styles.emptyOrderTitle} numberOfLines={1}>
                  {t("noActiveOrder")}
                </Text>
                <Text style={styles.emptyOrderBody}>{t("noActiveOrderBody")}</Text>
              </View>
            </View>
          )}

          {/* One-tap reorder, only when there is something to repeat. */}
          {canRepeat ? (
            <View style={styles.repeatCard}>
              <View style={styles.repeatIcon}>
                <Ionicons name="refresh" size={20} color={brand.midnight} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.repeatTitle} numberOfLines={2}>
                  ⚡ {t("repeatPrevTitle")}
                </Text>
                <Text style={styles.repeatBody} numberOfLines={2}>
                  {t("repeatPrevBody")}
                </Text>
              </View>
              <Pressable
                style={[styles.repeatButton, repeating && styles.repeatButtonBusy]}
                disabled={repeating}
                onPress={repeatLastOrder}
              >
                <Text style={styles.repeatButtonLabel} numberOfLines={1}>
                  {repeating ? "…" : `${t("repeatPrevAction")} ↺`}
                </Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable
            style={styles.giftBanner}
            onPress={() => router.push("/gifts")}
          >
            {/* Timberwolf rather than the catalogue's purple: it is the only
                warm colour in the palette, so it lifts the banner off the
                midnight-green hero without introducing a sixth hue. */}
            <LinearGradient
              colors={[brand.timberwolf, brand.timberwolfDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.giftBannerInner}
            >
              <Ionicons name="gift" size={30} color={brand.midnight} />
              <View style={{ flex: 1 }}>
                <Text style={styles.giftTitle} numberOfLines={1}>
                  🎁 {t("giftBox")}
                </Text>
                <Text style={styles.giftSubtitle} numberOfLines={2}>
                  {t("giftBoxSubtitle")}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={22}
                color={brand.midnight}
              />
            </LinearGradient>
          </Pressable>
        </LinearGradient>

        {/* ── Bento services grid ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("services")}</Text>

          {/* Row 1: Feature card (left) + 2 stacked cards (right) */}
          <View style={styles.row1}>
            {/* Feature card — Quru Təmizləmə */}
            <PressCard
              onPress={() => router.push(`/service/${feat.serviceId}`)}
              style={[styles.featureCard, { backgroundColor: featTheme.bg }]}
              contentStyle={styles.featureContent}
            >
              <View>
                <View style={styles.featureTop}>
                  <ServiceIcon
                    icon={feat.icon}
                    bg={featTheme.iconBg}
                    fg={featTheme.iconFg}
                    size={48}
                  />
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularLabel} numberOfLines={1}>
                      {t("mostPopular")}
                    </Text>
                  </View>
                </View>
                <Text style={styles.featureTitle} numberOfLines={2}>
                  {copy.service(feat)}
                </Text>
                <Text style={styles.featureTagline} numberOfLines={3}>
                  {copy.tagline(feat)}
                </Text>
              </View>
              <View style={styles.orderRow}>
                <Text style={styles.orderLabel}>{t("order")}</Text>
                <Ionicons
                  name="arrow-forward"
                  size={14}
                  color={colors.textPrimary}
                />
              </View>
            </PressCard>

            {/* Right column */}
            <View style={styles.rightCol}>
              {/* Ütüləmə */}
              <PressCard
                onPress={() => router.push(`/service/${ironing.serviceId}`)}
                style={[styles.mediumCard, { backgroundColor: ironTheme.bg }]}
                contentStyle={styles.mediumContent}
              >
                <ServiceIcon
                  icon={ironing.icon}
                  bg={ironTheme.iconBg}
                  fg={ironTheme.iconFg}
                  size={42}
                />
                <View>
                  <Text style={styles.mediumTitle} numberOfLines={2}>
                    {copy.service(ironing)}
                  </Text>
                  <View style={styles.baxRow}>
                    <Text style={[styles.baxLabel, { color: ironTheme.fg }]}>{t("view")}</Text>
                    <Ionicons
                      name="arrow-forward"
                      size={12}
                      color={ironTheme.fg}
                    />
                  </View>
                </View>
              </PressCard>

              {/* Ayaqqabı təmizliyi */}
              <PressCard
                onPress={() => router.push(`/service/${shoes.serviceId}`)}
                style={[styles.mediumCard, { backgroundColor: shoeTheme.bg }]}
                contentStyle={styles.mediumContent}
              >
                <ServiceIcon
                  icon={shoes.icon}
                  bg={shoeTheme.iconBg}
                  fg={shoeTheme.iconFg}
                  size={42}
                />
                <View>
                  <Text style={styles.mediumTitle} numberOfLines={2}>
                    {copy.service(shoes)}
                  </Text>
                  <View style={styles.baxRow}>
                    <Text style={[styles.baxLabel, { color: shoeTheme.fg }]}>{t("view")}</Text>
                    <Ionicons
                      name="arrow-forward"
                      size={12}
                      color={shoeTheme.fg}
                    />
                  </View>
                </View>
              </PressCard>
            </View>
          </View>

          {/* Toplu — a different kind of order (deposit now, real total after
              the courier counts), so it gets its own full-width band rather
              than sitting in the grid as if it were one more price list. */}
          <PressCard
            onPress={() => router.push("/toplu")}
            style={[styles.topluCard, { backgroundColor: SERVICE_THEME.toplu.bg }]}
            contentStyle={styles.topluContent}
          >
            <ServiceIcon
              icon={serviceTheme.toplu.icon}
              bg={SERVICE_THEME.toplu.iconBg}
              fg={SERVICE_THEME.toplu.iconFg}
              size={46}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.topluTitle} numberOfLines={1}>
                {copy.label("toplu", serviceTheme.toplu.label)}
              </Text>
              <Text style={styles.topluTagline} numberOfLines={2}>
                {t("topluTagline")}
              </Text>
            </View>
            <View style={styles.topluDepositPill}>
              <Text style={[styles.topluDepositLabel, { color: SERVICE_THEME.toplu.fg }]}>
                {money(TOPLU_DEPOSIT)}
              </Text>
            </View>
          </PressCard>

          {/* Row 2: Two wide horizontal cards */}
          <View style={styles.row2}>
            {/* Ev Tekstili */}
            <PressCard
              onPress={() => router.push(`/service/${bedding.serviceId}`)}
              style={[styles.wideCard, { backgroundColor: bedTheme.bg }]}
              contentStyle={styles.wideContent}
            >
              <ServiceIcon
                icon={bedding.icon}
                bg={bedTheme.iconBg}
                fg={bedTheme.iconFg}
                size={40}
              />
              <View style={styles.wideText}>
                <Text style={styles.wideTitle} numberOfLines={2}>
                  {copy.service(bedding)}
                </Text>
                <Text style={styles.wideTagline} numberOfLines={2}>
                  {copy.tagline(bedding)}
                </Text>
              </View>
            </PressCard>

            {/* Aksesuarlar və Oyuncaqlar */}
            <PressCard
              onPress={() => router.push(`/service/${bags.serviceId}`)}
              style={[styles.wideCard, { backgroundColor: bagTheme.bg }]}
              contentStyle={styles.wideContent}
            >
              <ServiceIcon
                icon={bags.icon}
                bg={bagTheme.iconBg}
                fg={bagTheme.iconFg}
                size={40}
              />
              <View style={styles.wideText}>
                <Text style={styles.wideTitle} numberOfLines={2}>
                  {copy.service(bags)}
                </Text>
                <Text style={styles.wideTagline} numberOfLines={2}>
                  {copy.tagline(bags)}
                </Text>
              </View>
            </PressCard>
          </View>
        </View>

        {/* How it works — three numbered steps, for anyone opening the app
            before they have ordered anything. */}
        <View style={styles.howSection}>
          <Text style={styles.sectionTitle}>{t("howItWorks")}</Text>
          {[
            { icon: "phone-portrait-outline", title: t("howStep1Title"), body: t("howStep1Body") },
            { icon: "car-outline", title: t("howStep2Title"), body: t("howStep2Body") },
            { icon: "checkmark-circle-outline", title: t("howStep3Title"), body: t("howStep3Body") },
          ].map((step, i, all) => (
            <View key={step.title} style={styles.howStep}>
              <View style={styles.howRail}>
                <View style={styles.howBubble}>
                  <Ionicons
                    name={step.icon as keyof typeof Ionicons.glyphMap}
                    size={20}
                    color={brand.midnight}
                  />
                </View>
                {i < all.length - 1 ? <View style={styles.howLine} /> : null}
              </View>
              <View style={styles.howBody}>
                <Text style={styles.howNumber}>{`0${i + 1}`}</Text>
                <Text style={styles.howTitle}>{step.title}</Text>
                <Text style={styles.howText}>{step.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* The cart button is the shared <CartFab/> mounted in app/_layout.tsx,
          which renders on this route only — see that component. */}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.background },

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: { paddingHorizontal: 20, paddingBottom: 26 },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  langSwitch: { flexDirection: "row", gap: 6 },
  langPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill },
  langPillActive: { backgroundColor: colors.surface },
  langLabel: { fontFamily: font.semibold, fontSize: 13, color: "rgba(255,255,255,0.85)" },
  langLabelActive: { color: colors.textPrimary },
  bell: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: brand.scrim,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    fontFamily: font.extrabold,
    fontSize: 26,
    letterSpacing: -0.5,
    color: colors.textInverse,
    marginTop: 18,
  },
  // The shipped design set the greeting in gold so it lifted off the blue.
  // Light Blue does the same job against Midnight Green and stays inside the
  // palette; white-on-teal would flatten it into the brand line above.
  greeting: {
    fontFamily: font.extrabold,
    color: brand.lightBlue,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
    marginTop: 2,
  },

  inbox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: brand.scrim,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginTop: 18,
  },
  inboxLabel: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 13.5,
    lineHeight: 19,
    color: brand.onDarkSoft,
  },

  repeatCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: brand.surface,
    borderRadius: radius.lg,
    padding: 14,
    marginTop: 16,
  },
  repeatIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: brand.lightBlueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  repeatTitle: { fontFamily: font.bold, fontSize: 14.5, color: colors.textPrimary },
  // The button keeps its size; the text block beside it (already flex:1)
  // absorbs the difference, so a long Russian label can't push it off-card.
  repeatBody: {
    fontFamily: font.regular,
    fontSize: 12.5,
    color: colors.textSecondary,
    marginTop: 2,
  },
  repeatButton: {
    backgroundColor: brand.midnight,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexShrink: 0,
  },
  repeatButtonBusy: { opacity: 0.6 },
  repeatButtonLabel: { fontFamily: font.bold, fontSize: 12.5, color: colors.textInverse },

  // How it works
  howSection: { paddingHorizontal: 16, paddingTop: 26, gap: 10 },
  howStep: { flexDirection: "row", gap: 14 },
  howRail: { alignItems: "center", width: 44 },
  howBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: brand.lightBlueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  howLine: { flex: 1, width: 2, minHeight: 26, backgroundColor: brand.borderStrong },
  howBody: { flex: 1, paddingBottom: 22 },
  howNumber: {
    fontFamily: font.bold,
    fontSize: 12.5,
    letterSpacing: 0.5,
    color: brand.moonstone,
  },
  howTitle: {
    fontFamily: font.bold,
    fontSize: 17,
    color: colors.textPrimary,
    marginTop: 2,
  },
  howText: {
    fontFamily: font.regular,
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.textSecondary,
    marginTop: 3,
  },

  // First-order offer
  promoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: brand.aliceBlue,
    borderRadius: radius.lg,
    padding: 14,
    marginTop: 18,
  },
  promoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: brand.lightBlue,
    alignItems: "center",
    justifyContent: "center",
  },
  promoTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  promoTitle: {
    flex: 1,
    fontFamily: font.bold,
    fontSize: 14.5,
    color: brand.onSoft,
  },
  promoBadge: {
    backgroundColor: brand.moonstone,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    // Holds its width so the title beside it is what gives way; without this
    // the badge gets crushed and its label spills past the pill.
    flexShrink: 0,
  },
  promoBadgeLabel: { fontFamily: font.bold, fontSize: 10, color: brand.onDark },
  promoBody: {
    fontFamily: font.regular,
    fontSize: 12.5,
    lineHeight: 17,
    color: brand.onSoftMuted,
    marginTop: 3,
  },

  // Active order
  orderCard: {
    backgroundColor: brand.scrim,
    borderRadius: radius.lg,
    padding: 16,
    marginTop: 16,
  },
  orderTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroOrderLabel: {
    flexShrink: 1,
    fontFamily: font.semibold,
    fontSize: 11.5,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: brand.onDarkFaint,
  },
  orderNo: { flexShrink: 0, fontFamily: font.medium, fontSize: 12, color: brand.onDarkFaint },
  orderState: {
    fontFamily: font.bold,
    fontSize: 18,
    letterSpacing: -0.2,
    color: colors.textInverse,
    marginTop: 6,
  },
  progressTrack: { flexDirection: "row", gap: 4, marginTop: 14 },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  progressSegmentDone: { backgroundColor: brand.lightBlue },
  orderActionRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 },
  orderAction: { fontFamily: font.bold, fontSize: 14, color: colors.textInverse },

  emptyOrderCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.13)",
    borderRadius: radius.lg,
    padding: 16,
    marginTop: 16,
  },
  emptyOrderTitle: { fontFamily: font.bold, fontSize: 15, color: colors.textInverse },
  emptyOrderBody: {
    fontFamily: font.regular,
    fontSize: 12.5,
    lineHeight: 17,
    color: brand.onDarkSoft,
    marginTop: 3,
  },
  giftBanner: { marginTop: 22, borderRadius: radius.lg, overflow: "hidden" },
  giftBannerInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
  },
  giftTitle: { fontFamily: font.bold, fontSize: 16, color: brand.onSoft },
  giftSubtitle: {
    fontFamily: font.regular,
    fontSize: 12.5,
    color: brand.onSoftMuted,
    marginTop: 3,
  },

  // ── Services bento grid ───────────────────────────────────────────────────
  section: { paddingHorizontal: 16, paddingTop: 20, gap: 10 },
  sectionTitle: {
    fontFamily: font.extrabold,
    fontSize: 22,
    letterSpacing: -0.4,
    color: colors.textPrimary,
    marginBottom: 4,
  },

  // Row 1: equal 50-50 width columns
  row1: { flexDirection: "row", gap: 10, alignItems: "stretch" },

  // Feature card (left)
  featureCard: {
    flex: 1,
    borderRadius: 20,
    minHeight: 240,
  },
  featureContent: {
    padding: 14,
    justifyContent: "space-between",
  },
  featureTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  popularBadge: {
    backgroundColor: "rgba(255,255,255,0.82)",
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    // Shrinks rather than overflowing: the Russian label is longer than the
    // gap left beside the 48pt service icon.
    flexShrink: 1,
  },
  popularLabel: {
    fontFamily: font.bold,
    fontSize: 9.5,
    color: brand.midnight,
    letterSpacing: 0.4,
  },
  featureTitle: {
    fontFamily: font.bold,
    fontSize: 17,
    letterSpacing: -0.3,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  featureTagline: {
    fontFamily: font.regular,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
    marginTop: 4,
  },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 12,
  },
  orderLabel: {
    fontFamily: font.bold,
    fontSize: 14,
    color: colors.textPrimary,
  },

  // Right column (2 stacked medium cards)
  rightCol: { flex: 1, gap: 10 },
  mediumCard: {
    flex: 1,
    borderRadius: 20,
    minHeight: 115,
  },
  mediumContent: {
    padding: 12,
    justifyContent: "space-between",
  },
  mediumTitle: {
    fontFamily: font.bold,
    fontSize: 15,
    color: colors.textPrimary,
    marginTop: 6,
    lineHeight: 18,
  },
  baxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 3,
  },
  baxLabel: {
    fontFamily: font.bold,
    fontSize: 12,
  },

  // Toplu — full-width band between the two grid rows
  topluCard: { borderRadius: 20 },
  topluContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
  },
  topluTitle: { fontFamily: font.bold, fontSize: 17, color: colors.textPrimary },
  topluTagline: {
    fontFamily: font.regular,
    fontSize: 12.5,
    color: colors.textSecondary,
    marginTop: 3,
  },
  topluDepositPill: {
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    // The price must never be the thing that gives way.
    flexShrink: 0,
  },
  topluDepositLabel: { fontFamily: font.bold, fontSize: 14 },

  // Row 2: two wide horizontal cards
  row2: { flexDirection: "row", gap: 10 },
  wideCard: {
    flex: 1,
    borderRadius: 20,
    minHeight: 88,
  },
  wideContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  // ~100pt once the chevron is gone, which is what the longest single word in
  // the grid ("Aksesuarlar", "Accessories", "Аксессуары") actually needs.
  wideText: { flex: 1 },
  wideTitle: {
    fontFamily: font.bold,
    fontSize: 13.5,
    color: colors.textPrimary,
    lineHeight: 17,
  },
  wideTagline: {
    fontFamily: font.regular,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },

});
