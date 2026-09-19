import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/language-context";
import { BigButton } from "@/components/ui";
import { brand, font } from "@/theme/tokens";
import { useErrorAlert } from "@/lib/alerts";

/**
 * "I forgot my password."
 *
 * The screen says the same thing whether or not the address has an account.
 * Telling the customer "no account with that e-mail" would be friendlier and
 * would also turn this form into a way of asking the app who is registered —
 * one address at a time, from anywhere, with no sign-in. Supabase answers
 * identically for both cases and this screen matches it.
 */
export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { sendPasswordReset } = useAuth();

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Failures interrupt rather than sitting in red under the button.
  useErrorAlert(error);

  const onSend = async () => {
    setError(null);

    const address = email.trim();
    if (!address.includes("@")) return setError(t("resetEmailInvalid"));

    setSending(true);
    const { error: sendError } = await sendPasswordReset(address);
    setSending(false);

    // A transport failure is worth showing; "no such account" never reaches
    // here, by design.
    if (sendError) {
      setError(sendError);
      return;
    }
    setSent(true);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={[styles.body, { paddingTop: insets.top + 32 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={brand.midnight} />
        </Pressable>

        <Text style={styles.title}>{t("resetTitle")}</Text>
        <Text style={styles.subtitle}>{t("resetSubtitle")}</Text>

        {sent ? (
          <View style={styles.sentBox}>
            <Ionicons name="mail-open-outline" size={22} color={brand.midnight} />
            <Text style={styles.sentTitle}>{t("resetSentTitle")}</Text>
            <Text style={styles.sentBody}>{t("resetSentBody", { email: email.trim() })}</Text>
            <Pressable onPress={() => router.replace("/(auth)/login")} hitSlop={8}>
              <Text style={styles.link}>{t("signupBackToLogin")}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.label}>{t("emailLabel")}</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder={t("emailPlaceholder")}
              placeholderTextColor={brand.moonstoneInk}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!sending}
            />

            

            <BigButton
              label={t("resetSendBtn")}
              tone="brand"
              onPress={onSend}
              loading={sending}
              iconRight="paper-plane-outline"
            />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.background },
  body: { paddingHorizontal: 24, paddingBottom: 40, gap: 8 },
  back: { alignSelf: "flex-start", marginBottom: 8 },
  title: { fontFamily: font.bold, fontSize: 26, color: brand.midnight },
  subtitle: { fontFamily: font.regular, fontSize: 14, color: brand.moonstoneInk, marginBottom: 16 },
  label: { fontFamily: font.medium, fontSize: 13, color: brand.midnight, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: brand.moonstoneInk,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: font.regular,
    fontSize: 15,
    color: brand.midnight,
    backgroundColor: "#fff",
    marginBottom: 12,
  },
  error: { fontFamily: font.medium, fontSize: 13, color: "#c0392b", marginBottom: 8 },
  link: { fontFamily: font.semibold, fontSize: 14, color: brand.midnight, marginTop: 8 },
  sentBox: {
    alignItems: "center",
    gap: 6,
    padding: 20,
    borderRadius: 18,
    backgroundColor: brand.moonstoneSoft,
    marginTop: 12,
  },
  sentTitle: { fontFamily: font.bold, fontSize: 17, color: brand.midnight },
  sentBody: { fontFamily: font.regular, fontSize: 14, color: brand.midnight, textAlign: "center" },
});
