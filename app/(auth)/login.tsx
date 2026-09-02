import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppLogo } from "@/components/AppLogo";
import { brand, colors, font, radius } from "@/theme/tokens";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
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
  const { signInWithPassword, signInWithGoogle } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const onGoogle = async () => {
    setError(null);
    setGoogleBusy(true);
    const { error: googleError } = await signInWithGoogle();
    setGoogleBusy(false);

    if (googleError) {
      setError(googleError);
      return;
    }

    // A cancelled sheet returns no error and no session. Routing on the
    // session rather than on "no error" keeps a dismissed browser from
    // pushing an unauthenticated screen that bounces straight back.
    const { data } = await supabase.auth.getSession();
    if (data.session) router.replace("/(tabs)");
  };

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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
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
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
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
              autoComplete="current-password"
              textContentType="password"
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

        {/* Forgotten password. Placed under the button rather than beside the
            field: it is the escape hatch, not a peer of signing in. */}
        <Pressable
          onPress={() => router.push("/(auth)/forgot-password")}
          hitSlop={8}
          style={styles.forgotWrap}
        >
          <Text style={styles.forgotLink}>{t("forgotPassword")}</Text>
        </Pressable>

        {/* ── Google ──
            One tap, no password to invent and none to forget — which is most
            of what the reset flow above exists to rescue. */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t("orDivider")}</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          onPress={onGoogle}
          disabled={googleBusy}
          style={({ pressed }) => [
            styles.googleBtn,
            (pressed || googleBusy) && styles.googleBtnPressed,
          ]}
        >
          {googleBusy ? (
            <ActivityIndicator color={brand.midnight} />
          ) : (
            <>
              <Ionicons name="logo-google" size={18} color={brand.midnight} />
              <Text style={styles.googleLabel}>{t("continueWithGoogle")}</Text>
            </>
          )}
        </Pressable>

        {/* Sign up link */}
        <View style={styles.signupRow}>
          <Text style={styles.signupText}>{t("noAccount")} </Text>
          <Pressable onPress={() => router.replace("/(auth)/signup")} hitSlop={8}>
            <Text style={styles.signupLink}>{t("registerLink")}</Text>
          </Pressable>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
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

  forgotWrap: { alignSelf: "center", marginTop: 12 },
  forgotLink: {
    fontFamily: font.semibold,
    fontSize: 14,
    color: brand.midnight,
    textDecorationLine: "underline",
  },

  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 18 },
  dividerLine: { flex: 1, height: 1, backgroundColor: brand.moonstoneSoft },
  dividerText: { fontFamily: font.medium, fontSize: 13, color: colors.textSecondary },

  // Outlined rather than filled: Google is the alternative, not the primary
  // action, and two solid buttons stacked would compete for the same eye.
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 15,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: brand.moonstoneInk,
    backgroundColor: "#fff",
  },
  googleBtnPressed: { opacity: 0.7 },
  googleLabel: { fontFamily: font.semibold, fontSize: 15, color: brand.midnight },

  signupRow: {
    flexDirection: "row",
    flexWrap: "wrap",
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
