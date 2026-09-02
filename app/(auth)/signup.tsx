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
} from "react-native";
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

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const { signUp, verifySignupCode, resendSignupCode } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const onSubmit = async () => {
    setError(null);

    // Checked here rather than left to the database: a courier standing at a
    // door with no phone number has no way to finish the job.
    if (!name.trim()) return setError(t("signupNameRequired"));
    if (phone.trim().length < 7) return setError(t("signupPhoneRequired"));
    if (password.length < 8) return setError(t("signupPasswordShort"));

    setSubmitting(true);
    const { error: signUpError, needsConfirmation } = await signUp(email.trim(), password, {
      name: name.trim(),
      phone: phone.trim(),
    });
    setSubmitting(false);

    if (signUpError) {
      setError(signUpError);
      return;
    }
    // With email confirmation on, signUp returns no session. Routing into the
    // app here bounced straight back off the auth guard with nothing said, so
    // the screen now explains what happened instead.
    if (needsConfirmation) {
      setConfirmSent(true);
      return;
    }
    router.replace("/(tabs)");
  };

  /**
   * Finish the signup with the six-digit code.
   *
   * Verifying is what sets email_confirmed_at, and the database waits for that
   * before creating the profile — so until this succeeds the customer has an
   * unverified account and nothing else. Getting it right is the whole signup.
   */
  const onVerify = async () => {
    setError(null);
    if (code.length !== 6) return setError(t("signupCodeLength"));

    setVerifying(true);
    const { error: verifyError } = await verifySignupCode(email.trim(), code);
    setVerifying(false);

    if (verifyError) {
      setError(verifyError);
      return;
    }

    // verifyOtp signs them in, so there is a session and the auth guard lets
    // them through — no second trip to the login screen.
    router.replace("/(tabs)");
  };

  const onResend = async () => {
    setError(null);
    setResending(true);
    const { error: resendError } = await resendSignupCode(email.trim());
    setResending(false);
    if (resendError) setError(resendError);
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
        <Text style={styles.heroTitle}>{t("signupTitle")}</Text>
        <Text style={styles.heroSub}>{t("signupSubtitle")}</Text>
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
        {/* Name field */}
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>{t("signupNameLabel")}</Text>
          <View style={styles.inputRow}>
            <Ionicons name="person-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder={t("signupNamePlaceholder")}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              value={name}
              onChangeText={setName}
            />
          </View>
        </View>

        {/* Phone field */}
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>{t("signupPhoneLabel")}</Text>
          <View style={styles.inputRow}>
            <Ionicons name="call-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder={t("signupPhonePlaceholder")}
              placeholderTextColor={colors.textSecondary}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              value={phone}
              onChangeText={setPhone}
            />
          </View>
        </View>

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
              autoComplete="new-password"
              textContentType="newPassword"
              value={password}
              onChangeText={setPassword}
            />
          </View>
        </View>

        {/* Error message */}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {confirmSent ? (
          <View style={styles.confirmBox}>
            <Ionicons name="mail-open-outline" size={22} color={brand.midnight} />
            <Text style={styles.confirmTitle}>{t("signupConfirmTitle")}</Text>
            <Text style={styles.confirmBody}>
              {t("signupConfirmBody", { email: email.trim() })}
            </Text>

            <TextInput
              style={styles.codeInput}
              value={code}
              onChangeText={(next) => setCode(next.replace(/[^0-9]/g, "").slice(0, 6))}
              placeholder="123456"
              placeholderTextColor={brand.moonstoneInk}
              keyboardType="number-pad"
              // The OS fills this straight from the notification, so the
              // customer never has to leave the app to read their own code.
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              editable={!verifying}
            />

            <BigButton
              label={t("signupVerifyBtn")}
              tone="brand"
              onPress={onVerify}
              loading={verifying}
              iconRight="checkmark-circle-outline"
            />

            <Pressable onPress={onResend} disabled={resending} hitSlop={8}>
              <Text style={styles.confirmLink}>
                {resending ? t("signupResending") : t("signupResendCode")}
              </Text>
            </Pressable>

            <Pressable onPress={() => router.replace("/(auth)/login")} hitSlop={8}>
              <Text style={styles.confirmLink}>{t("signupBackToLogin")}</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Sign up button — hidden once the code has been sent, so there is one
            obvious next action rather than two competing ones. */}
        {confirmSent ? null : (
          <BigButton
            label={t("signupBtn")}
            tone="brand"
            onPress={onSubmit}
            loading={submitting}
            iconRight="person-add-outline"
          />
        )}

        {/* Login link */}
        <View style={styles.loginRow}>
          <Text style={styles.loginText}>{t("alreadyHaveAccount")} </Text>
          <Pressable onPress={() => router.replace("/(auth)/login")} hitSlop={8}>
            <Text style={styles.loginLink}>{t("loginLink")}</Text>
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

  confirmBox: {
    alignItems: "center",
    gap: 8,
    backgroundColor: brand.moonstoneSoft,
    borderWidth: 1,
    borderColor: brand.borderStrong,
    borderRadius: radius.lg,
    padding: 20,
    marginBottom: 4,
  },
  confirmTitle: { fontFamily: font.bold, fontSize: 16, color: colors.textPrimary },
  confirmBody: {
    fontFamily: font.regular,
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.textSecondary,
    textAlign: "center",
  },
  confirmLink: { fontFamily: font.semibold, fontSize: 14, color: brand.midnight, marginTop: 4 },
  // Wide letter spacing and a large size: six digits copied from a
  // notification are read back one at a time, and a cramped field is where
  // people mistype them.
  codeInput: {
    alignSelf: "stretch",
    marginTop: 12,
    marginBottom: 4,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: brand.moonstoneInk,
    backgroundColor: brand.background,
    fontFamily: font.bold,
    fontSize: 26,
    letterSpacing: 8,
    textAlign: "center",
    color: brand.midnight,
  },
  error: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.danger,
    marginTop: -4,
  },

  loginRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  loginText: {
    fontFamily: font.regular,
    fontSize: 15,
    color: colors.textSecondary,
  },
  loginLink: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: brand.midnight,
  },
});
