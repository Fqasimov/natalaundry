import { useState } from "react";
import { View, Text, TextInput, StyleSheet, ScrollView, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Link, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius } from "@/theme/tokens";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/language-context";
import { LANGUAGES, type Language } from "@/lib/i18n";
import { BigButton } from "@/components/ui";

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setSubmitting(true);
    const { error: signUpError } = await signUp(email.trim(), password);
    setSubmitting(false);
    if (signUpError) {
      setError(signUpError);
      return;
    }
    router.replace("/(tabs)");
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.heroFrom, colors.heroTo]}
        style={[styles.hero, { paddingTop: insets.top + 16 }]}
      >
        <View style={styles.langSwitch}>
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
        <Text style={styles.brand}>{t("brand")}</Text>
        <Text style={styles.heroTitle}>{t("heroTitle")}</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Text style={styles.formTitle}>{t("signup")}</Text>

        <TextInput
          style={styles.input}
          placeholder={t("email")}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder={t("password")}
          placeholderTextColor={colors.textSecondary}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <BigButton label={t("signup")} tone="primary" onPress={onSubmit} loading={submitting} />

        <Link href="/(auth)/login" style={styles.link}>
          <Text style={styles.linkLabel}>{t("login")}</Text>
        </Link>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  hero: { paddingHorizontal: 24, paddingBottom: 34 },
  langSwitch: { flexDirection: "row", gap: 6 },
  langPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.pill },
  langPillActive: { backgroundColor: colors.surface },
  langLabel: { fontFamily: font.semibold, fontSize: 13, color: "rgba(255,255,255,0.85)" },
  langLabelActive: { color: colors.textPrimary },
  brand: { fontFamily: font.semibold, fontSize: 16, color: "rgba(255,255,255,0.85)", marginTop: 24 },
  heroTitle: {
    fontFamily: font.bold,
    fontSize: 27,
    lineHeight: 35,
    color: colors.textInverse,
    marginTop: 6,
  },
  form: { padding: 24, gap: 12 },
  formTitle: { fontFamily: font.bold, fontSize: 22, color: colors.textPrimary, marginBottom: 4 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 15,
    fontFamily: font.regular,
    fontSize: 15,
    color: colors.textPrimary,
  },
  error: { fontFamily: font.regular, fontSize: 13, color: colors.danger },
  link: { alignSelf: "center", marginTop: 18 },
  linkLabel: { fontFamily: font.medium, fontSize: 15, color: colors.primary },
});
