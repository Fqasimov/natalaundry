import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "@/lib/language-context";
import { LANGUAGES, type Language } from "@/lib/i18n";
import { AppLogo } from "@/components/AppLogo";
import { colors, font, radius } from "@/theme/tokens";

export default function CustomerPortalScreen() {
  const insets = useSafeAreaInsets();
  const { t, lang, setLang } = useI18n();

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

        {/* Back button */}
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={12}
        >
          <View style={styles.backCircle}>
            <Ionicons name="chevron-back" size={20} color={colors.textInverse} />
          </View>
        </Pressable>

        {/* App mark */}
        <View style={styles.avatarWrap}>
          <AppLogo size={80} />
        </View>

        {/* Title */}
        <Text style={styles.title}>{t("customerPortal")}</Text>
        <Text style={styles.subtitle}>{t("customerPortalSubtitle")}</Text>
      </LinearGradient>

      {/* Buttons area */}
      <View style={[styles.body, { paddingBottom: insets.bottom + 32 }]}>
        {/* Primary: I have an account */}
        <Pressable
          style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.85 }]}
          onPress={() => router.push("/(auth)/login")}
        >
          <Ionicons name="log-in-outline" size={20} color={colors.textInverse} style={styles.btnIcon} />
          <Text style={styles.btnPrimaryLabel}>{t("hasAccount")}</Text>
        </Pressable>

        {/* Secondary: Create new account */}
        <Pressable
          style={({ pressed }) => [styles.btnSecondary, pressed && { opacity: 0.75 }]}
          onPress={() => router.push("/(auth)/signup")}
        >
          <Ionicons name="person-add-outline" size={20} color={colors.textPrimary} style={styles.btnIcon} />
          <Text style={styles.btnSecondaryLabel}>{t("createAccount")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  langRow: {
    flexDirection: "row",
    alignSelf: "flex-end",
    gap: 4,
    marginBottom: 12,
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

  backBtn: {
    alignSelf: "flex-start",
    marginBottom: 20,
  },
  backCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },

  avatarWrap: { marginBottom: 16 },

  title: {
    fontFamily: font.extrabold,
    fontSize: 26,
    color: colors.textInverse,
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: font.regular,
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
  },

  // ── Body ──────────────────────────────────────────────────────────────────
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    gap: 14,
  },

  btnPrimary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 18,
  },
  btnIcon: { marginRight: 8 },
  btnPrimaryLabel: {
    fontFamily: font.semibold,
    fontSize: 16,
    color: colors.textInverse,
  },

  btnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 18,
  },
  btnSecondaryLabel: {
    fontFamily: font.semibold,
    fontSize: 16,
    color: colors.textPrimary,
  },
});
