import { useRef } from "react";
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
import { colors, font, radius } from "@/theme/tokens";
import { CATALOG } from "@/lib/catalog";
import { useI18n } from "@/lib/language-context";
import { LANGUAGES, type Language } from "@/lib/i18n";
import { useCart } from "@/lib/state/cart";

// ─── Service design tokens (from screenshot) ────────────────────────────────
const SERVICE_THEME: Record<
  string,
  { bg: string; iconBg: string; iconFg: string }
> = {
  dry_cleaning: { bg: "#E9E7FB", iconBg: "#5B57D6", iconFg: "#FFFFFF" },
  ironing:      { bg: "#FEF0E3", iconBg: "#F0922A", iconFg: "#FFFFFF" },
  shoes:        { bg: "#EDE8E2", iconBg: "#8A6A5C", iconFg: "#FFFFFF" },
  bedding:      { bg: "#DFF5F5", iconBg: "#2BB5B5", iconFg: "#FFFFFF" },
  bags:         { bg: "#FDEEF2", iconBg: "#E8215A", iconFg: "#FFFFFF" },
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
  const { count } = useCart();

  const [feat, ironing, shoes, bedding, bags] = CATALOG;
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
        {/* ── Hero gradient header ── */}
        <LinearGradient
          colors={[colors.heroFrom, colors.heroTo]}
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
          <Text style={styles.heroTitle}>{t("heroTitle")}</Text>
          <Text style={styles.heroSubtitle}>{t("heroSubtitle")}</Text>

          <View style={styles.chipRow}>
            <HeroChip icon="cube-outline" label={t("chipPickup")} />
            <HeroChip icon="headset-outline" label={t("chipSupport")} />
            <HeroChip icon="navigate-outline" label={t("chipTracking")} />
          </View>

          <Pressable
            style={styles.giftBanner}
            onPress={() => router.push("/gifts")}
          >
            <LinearGradient
              colors={["#7C2CB6", "#67199F"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.giftBannerInner}
            >
              <Ionicons name="gift" size={30} color="#F6D66B" />
              <View style={{ flex: 1 }}>
                <Text style={styles.giftTitle}>🎁 {t("giftBox")}</Text>
                <Text style={styles.giftSubtitle}>{t("giftBoxSubtitle")}</Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={22}
                color={colors.textInverse}
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
                    <Text style={styles.popularLabel}>{t("mostPopular")}</Text>
                  </View>
                </View>
                <Text style={styles.featureTitle}>{feat.name}</Text>
                <Text style={styles.featureTagline}>{feat.tagline}</Text>
              </View>
              <View style={styles.orderRow}>
                <Text style={styles.orderLabel}>Sifariş et</Text>
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
                  <Text style={styles.mediumTitle}>{ironing.name}</Text>
                  <View style={styles.baxRow}>
                    <Text style={[styles.baxLabel, { color: "#C96D12" }]}>Bax</Text>
                    <Ionicons
                      name="arrow-forward"
                      size={12}
                      color="#C96D12"
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
                  <Text style={styles.mediumTitle}>Ayaqqabı təmizliyi</Text>
                  <View style={styles.baxRow}>
                    <Text style={[styles.baxLabel, { color: "#735345" }]}>Bax</Text>
                    <Ionicons
                      name="arrow-forward"
                      size={12}
                      color="#735345"
                    />
                  </View>
                </View>
              </PressCard>
            </View>
          </View>

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
                <Text style={styles.wideTitle}>Ev Tekstili</Text>
                <Text style={styles.wideTagline} numberOfLines={1}>
                  Yorğanlar, yastı...
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color="#1C9E9E"
              />
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
                  {"Aksesuarlar\nvə Oyuncaqlar"}
                </Text>
                <Text style={styles.wideTagline} numberOfLines={1}>
                  Çantalar, oyunc...
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color="#CC184D"
              />
            </PressCard>
          </View>
        </View>
      </ScrollView>

      {/* Cart FAB */}
      {count > 0 ? (
        <Pressable
          style={[styles.cartFab, { bottom: insets.bottom + 92 }]}
          onPress={() => router.push("/checkout/schedule")}
        >
          <Ionicons name="cart" size={24} color={colors.textInverse} />
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeLabel}>{count}</Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

function HeroChip({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  return (
    <View style={styles.chip}>
      <Ionicons name={icon} size={13} color="#FFD98A" />
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

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
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    fontFamily: font.semibold,
    fontSize: 17,
    color: "rgba(255,255,255,0.82)",
    marginTop: 22,
  },
  heroTitle: {
    fontFamily: font.extrabold,
    fontSize: 33,
    lineHeight: 39,
    letterSpacing: -0.6,
    color: colors.textInverse,
    marginTop: 8,
  },
  heroSubtitle: {
    fontFamily: font.regular,
    fontSize: 14.5,
    lineHeight: 21,
    color: "rgba(255,255,255,0.88)",
    marginTop: 14,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 20 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipLabel: { fontFamily: font.medium, fontSize: 12, color: colors.textInverse },
  giftBanner: { marginTop: 22, borderRadius: radius.lg, overflow: "hidden" },
  giftBannerInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
  },
  giftTitle: { fontFamily: font.bold, fontSize: 16, color: colors.textInverse },
  giftSubtitle: {
    fontFamily: font.regular,
    fontSize: 12.5,
    color: "rgba(255,255,255,0.85)",
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
    backgroundColor: "rgba(255,255,255,0.78)",
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  popularLabel: {
    fontFamily: font.bold,
    fontSize: 9.5,
    color: "#2772DB",
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

  // Row 2: two wide horizontal cards
  row2: { flexDirection: "row", gap: 10 },
  wideCard: {
    flex: 1,
    borderRadius: 20,
    minHeight: 74,
  },
  wideContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
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

  // ── Cart FAB ──────────────────────────────────────────────────────────────
  cartFab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  cartBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  cartBadgeLabel: { fontFamily: font.bold, fontSize: 11, color: colors.textPrimary },
});
