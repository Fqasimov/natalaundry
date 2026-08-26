import { ActivityIndicator, View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/language-context";
import { LANGUAGES, type Language } from "@/lib/i18n";
import { AppLogo } from "@/components/AppLogo";
import { brand, colors, font, radius } from "@/theme/tokens";

// Admin lives on the website, not in the app: facility staff work at a desk
// with an order feed and dispatch controls, which is a poor fit for a phone,
// and shipping those controls to every install widens the app's blast radius
// for no benefit. The API still exposes the admin endpoints — only the client
// differs.
type Role = "customer" | "courier";

const ROLES: Array<{
  key: Role;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  fg: string;
  titleKey: "roleCustomer" | "roleCourier";
  descKey: "roleCustomerDesc" | "roleCourierDesc";
}> = [
  {
    key: "customer",
    icon: "shirt",            // clothes icon — perfect for laundry customer
    tint: brand.lightBlueSoft,
    fg: brand.midnight,
    titleKey: "roleCustomer",
    descKey: "roleCustomerDesc",
  },
  {
    key: "courier",
    icon: "bicycle",          // courier on bike — urban delivery
    tint: brand.timberwolfSoft,
    fg: brand.moonstone,
    titleKey: "roleCourier",
    descKey: "roleCourierDesc",
  },
];

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { session, isLoading } = useAuth();
  const { t, lang, setLang } = useI18n();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: brand.background }}>
        <ActivityIndicator size="large" color={brand.moonstone} />
      </View>
    );
  }

  // Already signed in → go to tabs
  if (session) {
    router.replace("/(tabs)");
    return null;
  }

  const onRolePress = (role: Role) => {
    if (role === "customer") {
      router.push("/(auth)/customer-portal");
    } else {
      // Couriers sign in with the same credentials screen; their role on the
      // profile decides which dashboard they land on after authenticating.
      router.push("/(auth)/login");
    }
  };

  return (
    <View style={styles.root}>
      {/* Midnight-green gradient hero header */}
      <LinearGradient
        colors={[brand.heroFrom, brand.heroMid, brand.heroTo]}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.7, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 12 }]}
      >
        {/* Language selector */}
        <View style={styles.langRow}>
          {LANGUAGES.map((code: Language) => (
            <Pressable
              key={code}
              onPress={() => setLang(code)}
              style={[styles.langPill, code === lang && styles.langPillActive]}
            >
              <Text style={[styles.langLabel, code === lang && styles.langLabelActive]}>
                {code.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* App mark */}
        <View style={styles.logoWrap}>
          <AppLogo size={88} />
        </View>

        {/* Brand name */}
        <Text style={styles.brand}>Nata Laundry</Text>

        {/* Hero subtitle */}
        <Text style={styles.heroSub}>{t("heroTitle")}</Text>
      </LinearGradient>

      {/* Bottom Alice Blue card area */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Callout label */}
        <Text style={styles.callout}>{t("welcomeCallout")}</Text>

        {/* Role cards */}
        <View style={styles.cards}>
          {ROLES.map((role) => (
            <Pressable
              key={role.key}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => onRolePress(role.key)}
            >
              {/* Icon bubble */}
              <View style={[styles.iconBubble, { backgroundColor: role.tint }]}>
                <Ionicons name={role.icon} size={22} color={role.fg} />
              </View>

              {/* Text */}
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{t(role.titleKey)}</Text>
                <Text style={styles.cardDesc}>{t(role.descKey)}</Text>
              </View>

              {/* Arrow */}
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </Pressable>
          ))}
        </View>

        {/* Footer */}
        <Text style={styles.footer}>· {t("copyright")} ·</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.background },

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 36,
  },
  langRow: {
    flexDirection: "row",
    alignSelf: "flex-end",
    gap: 4,
    marginBottom: 16,
  },
  langPill: {
    paddingHorizontal: 13,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  langPillActive: {
    backgroundColor: colors.surface,
  },
  langLabel: {
    fontFamily: font.semibold,
    fontSize: 13,
    color: brand.onDarkSoft,
  },
  langLabelActive: { color: colors.textPrimary },

  logoWrap: { marginBottom: 16 },

  brand: {
    fontFamily: font.extrabold,
    fontSize: 30,
    color: colors.textInverse,
    marginBottom: 8,
  },
  heroSub: {
    fontFamily: font.medium,
    fontSize: 15,
    color: brand.onDarkSoft,
    textAlign: "center",
    lineHeight: 22,
  },

  // ── Body ──────────────────────────────────────────────────────────────────
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 20, paddingTop: 28 },

  callout: {
    fontFamily: font.semibold,
    fontSize: 11,
    letterSpacing: 0.4,
    color: colors.textSecondary,
    marginBottom: 16,
    lineHeight: 17,
  },

  cards: { gap: 12 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: brand.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: brand.border,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },
  cardPressed: { opacity: 0.7 },

  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  cardText: { flex: 1 },
  cardTitle: {
    fontFamily: font.semibold,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  cardDesc: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textSecondary,
  },

  footer: {
    fontFamily: font.regular,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 40,
  },
});
