import { ActivityIndicator, View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/language-context";
import { LANGUAGES, type Language } from "@/lib/i18n";
import { colors, font, radius } from "@/theme/tokens";

type Role = "customer" | "courier" | "admin";

const ROLES: Array<{
  key: Role;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  fg: string;
  titleKey: "roleCustomer" | "roleCourier" | "roleAdmin";
  descKey: "roleCustomerDesc" | "roleCourierDesc" | "roleAdminDesc";
}> = [
  {
    key: "customer",
    icon: "shirt",            // clothes icon — perfect for laundry customer
    tint: "#E8F1FD",
    fg: colors.primary,
    titleKey: "roleCustomer",
    descKey: "roleCustomerDesc",
  },
  {
    key: "courier",
    icon: "bicycle",          // courier on bike — urban delivery
    tint: "#FDE9E3",
    fg: colors.accent,
    titleKey: "roleCourier",
    descKey: "roleCourierDesc",
  },
  {
    key: "admin",
    icon: "construct",        // tools/wrench — system management
    tint: "#FEF0D0",
    fg: "#E8912A",
    titleKey: "roleAdmin",
    descKey: "roleAdminDesc",
  },
];

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { session, isLoading } = useAuth();
  const { t, lang, setLang } = useI18n();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
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
    } else if (role === "courier") {
      // Placeholder: courier auth flow
      router.push("/(auth)/login");
    } else {
      // Placeholder: admin auth flow
      router.push("/(auth)/login");
    }
  };

  return (
    <View style={styles.root}>
      {/* Blue gradient hero header */}
      <LinearGradient
        colors={["#5AADEC", "#3184EC", "#1A6AD4"]}
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

        {/* Water-drop logo */}
        <View style={styles.logoWrap}>
          <View style={styles.logoCircle}>
            <Ionicons name="water" size={42} color={colors.primary} />
          </View>
        </View>

        {/* Brand name */}
        <Text style={styles.brand}>Nata Laundry</Text>

        {/* Hero subtitle */}
        <Text style={styles.heroSub}>{t("heroTitle")}</Text>
      </LinearGradient>

      {/* Bottom cream card area */}
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
  root: { flex: 1, backgroundColor: colors.background },

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
    color: "rgba(255,255,255,0.80)",
  },
  langLabelActive: { color: colors.textPrimary },

  logoWrap: { marginBottom: 16 },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },

  brand: {
    fontFamily: font.extrabold,
    fontSize: 30,
    color: colors.textInverse,
    marginBottom: 8,
  },
  heroSub: {
    fontFamily: font.medium,
    fontSize: 15,
    color: "rgba(255,255,255,0.90)",
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
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
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
