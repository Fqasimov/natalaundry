import { useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppLogo } from "@/components/AppLogo";
import { brand, colors, font, radius } from "@/theme/tokens";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/language-context";
import { LANGUAGES, type Language } from "@/lib/i18n";
import { BigButton } from "@/components/ui";

// router.back() does nothing when the stack is empty — a deep link or a
// reload lands here with no history — so fall back to the welcome screen
// rather than leaving the button dead.
const goBack = () => {
  if (router.canGoBack()) router.back();
  else router.replace("/");
};

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signInWithPassword } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await signInWithPassword(email.trim(), password);
    setSubmitting(false);
    if (signInError) {
      setError(signInError);
      return;
    }
    router.replace("/(tabs)");
  };

  return (
    <View style={styles.root}>
      {/* ── Midnight-green hero header ── */}
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

        {/* Back button */}
        <Pressable onPress={goBack} style={styles.backBtn} hitSlop={12}>
          <View style={styles.backCircle}>
            <Ionicons name="chevron-back" size={20} color={colors.textInverse} />
          </View>
        </Pressable>

        {/* App mark */}
        <View style={styles.logoWrap}>
          <AppLogo size={64} />
        </View>

        {/* Title */}
        <Text style={styles.heroTitle}>{t("customerLogin")}</Text>
        <Text style={styles.heroSub}>{t("customerLoginSubtitle")}</Text>
      </LinearGradient>

      {/* ── Form area ── */}
      <ScrollView
        contentContainerStyle={[styles.form, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Email field */}
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>{t("emailLabel")}</Text>
          <View style={styles.inputRow}>
            <Ionicons name="mail-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder={t("emailPlaceholder")}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>
        </View>

        {/* Password field */}
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>{t("passwordLabel")}</Text>
          <View style={styles.inputRow}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder={t("passwordPlaceholder")}
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>
        </View>

        {/* Error message */}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Login button */}
        <BigButton
          label={t("loginBtn")}
          tone="brand"
          onPress={onSubmit}
          loading={submitting}
          iconRight="log-in-outline"
        />

        {/* Sign up link */}
        <View style={styles.signupRow}>
          <Text style={styles.signupText}>{t("noAccount")} </Text>
          <Pressable onPress={() => router.replace("/(auth)/signup")} hitSlop={8}>
            <Text style={styles.signupLink}>{t("registerLink")}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.background },

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: {
    paddingHorizontal: 24,
    paddingBottom: 36,
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
  langPillActive: { backgroundColor: colors.surface },
  langLabel: {
    fontFamily: font.semibold,
    fontSize: 13,
    color: brand.onDarkSoft,
  },
  langLabelActive: { color: colors.textPrimary },

  backBtn: { marginBottom: 18, alignSelf: "flex-start", padding: 4 },
  backCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: brand.scrimStrong,
    alignItems: "center",
    justifyContent: "center",
  },

  logoWrap: { marginBottom: 16 },
  heroTitle: {
    fontFamily: font.extrabold,
    fontSize: 30,
    color: colors.textInverse,
    marginBottom: 6,
  },
  heroSub: {
    fontFamily: font.regular,
    fontSize: 14,
    color: brand.onDarkSoft,
  },

  // ── Form ──────────────────────────────────────────────────────────────────
  form: { padding: 24, gap: 16 },

  fieldWrap: { gap: 6 },
  fieldLabel: {
    fontFamily: font.medium,
    fontSize: 14,
    color: colors.textPrimary,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    paddingVertical: 16,
    fontFamily: font.regular,
    fontSize: 15,
    color: colors.textPrimary,
  },

  error: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.danger,
    marginTop: -4,
  },

  signupRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  signupText: {
    fontFamily: font.regular,
    fontSize: 15,
    color: colors.textSecondary,
  },
  signupLink: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: brand.midnight,
  },
});
