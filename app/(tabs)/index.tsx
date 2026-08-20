import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, money, radius, serviceTheme } from "@/theme/tokens";
import { TOPLU_DEPOSIT } from "@/lib/toplu";
import { CATALOG } from "@/lib/catalog";
import { useI18n } from "@/lib/language-context";
import { LANGUAGES, type Language } from "@/lib/i18n";
import { useCart } from "@/lib/state/cart";
import { IconBubble } from "@/components/ui";

// Home screen rebuilt from the 1.0.2 recording: full-bleed blue gradient
// hero with the AZ/RU/EN switcher, headline, trust chips and the purple
// Hədiyyə Qutusu banner, sitting above the ivory Xidmətlər grid.
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { t, lang, setLang } = useI18n();
  const { count } = useCart();

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
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
                    <Text style={[styles.langLabel, active && styles.langLabelActive]}>
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
              <Ionicons name="notifications-outline" size={20} color={colors.textInverse} />
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

          <Pressable style={styles.giftBanner} onPress={() => router.push("/gifts")}>
            <LinearGradient
              colors={[colors.purpleFrom, colors.purpleTo]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.giftBannerInner}
            >
              <Ionicons name="gift" size={30} color="#F6D66B" />
              <View style={{ flex: 1 }}>
                <Text style={styles.giftTitle}>🎁 {t("giftBox")}</Text>
                <Text style={styles.giftSubtitle}>{t("giftBoxSubtitle")}</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.textInverse} />
            </LinearGradient>
          </Pressable>
        </LinearGradient>

        <View style={styles.servicesSection}>
          <Text style={styles.sectionTitle}>{t("services")}</Text>

          <Pressable
            style={styles.featureCard}
            onPress={() => router.push("/service/dry_cleaning")}
          >
            <View style={styles.featureTop}>
              <IconBubble
                name={serviceTheme.dry_cleaning.icon}
                tint="#FFFFFF"
                fg={serviceTheme.dry_cleaning.fg}
                size={54}
              />
              <View style={styles.popularBadge}>
                <Text style={styles.popularLabel}>{t("mostPopular")}</Text>
              </View>
            </View>
            <Text style={styles.featureTitle}>{serviceTheme.dry_cleaning.label}</Text>
            <Text style={styles.featureTagline}>{CATALOG[0].tagline}</Text>
          </Pressable>

          {/* Bulk gets its own full-width card: it's a different kind of
              order (deposit now, real total after the courier counts), so
              it shouldn't sit in the grid as if it were one more price list. */}
          <Pressable style={styles.topluCard} onPress={() => router.push("/toplu")}>
            <IconBubble
              name={serviceTheme.toplu.icon}
              tint="rgba(255,255,255,0.65)"
              fg={serviceTheme.toplu.fg}
              size={46}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.topluTitle}>{serviceTheme.toplu.label}</Text>
              <Text style={styles.topluTagline}>{t("topluTagline")}</Text>
            </View>
            <View style={styles.topluDepositPill}>
              <Text style={styles.topluDepositLabel}>{money(TOPLU_DEPOSIT)}</Text>
            </View>
          </Pressable>

          <View style={styles.serviceGrid}>
            {CATALOG.slice(1).map((service) => {
              const theme = serviceTheme[service.serviceId];
              return (
                <Pressable
                  key={service.serviceId}
                  style={styles.serviceCard}
                  onPress={() => router.push(`/service/${service.serviceId}`)}
                >
                  <IconBubble name={service.icon} tint={theme.tint} fg={theme.fg} size={42} />
                  <Text style={styles.serviceName}>{theme.label}</Text>
                  <View style={styles.viewRow}>
                    <Text style={styles.viewLabel}>{t("view")}</Text>
                    <Ionicons name="arrow-forward" size={13} color={colors.textSecondary} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>

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
  hero: { paddingHorizontal: 20, paddingBottom: 26 },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
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
  servicesSection: { paddingHorizontal: 20, paddingTop: 24 },
  sectionTitle: {
    fontFamily: font.extrabold,
    fontSize: 22,
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  featureCard: {
    backgroundColor: "#E9E7FB",
    borderRadius: radius.xl,
    padding: 18,
    marginTop: 16,
  },
  featureTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  popularBadge: {
    backgroundColor: "rgba(255,255,255,0.75)",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  popularLabel: { fontFamily: font.semibold, fontSize: 10, color: "#5B57D6", letterSpacing: 0.4 },
  featureTitle: { fontFamily: font.bold, fontSize: 20, color: colors.textPrimary, marginTop: 14 },
  featureTagline: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
  topluCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: serviceTheme.toplu.tint,
    borderRadius: radius.lg,
    padding: 16,
    marginTop: 12,
  },
  topluTitle: { fontFamily: font.bold, fontSize: 17, color: colors.textPrimary },
  topluTagline: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 3,
  },
  topluDepositPill: {
    backgroundColor: "rgba(255,255,255,0.75)",
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  topluDepositLabel: { fontFamily: font.bold, fontSize: 14, color: serviceTheme.toplu.fg },
  serviceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
  serviceCard: {
    width: "47.5%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  serviceName: {
    fontFamily: font.semibold,
    fontSize: 14.5,
    color: colors.textPrimary,
    marginTop: 10,
  },
  viewRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  viewLabel: { fontFamily: font.regular, fontSize: 12.5, color: colors.textSecondary },
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
