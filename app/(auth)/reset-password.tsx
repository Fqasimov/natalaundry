import { useEffect, useState } from "react";
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/language-context";
import { supabase } from "@/lib/supabase";
import { isStrongPassword } from "@/lib/password";
import { PasswordRules } from "@/components/PasswordRules";
import { BigButton } from "@/components/ui";
import { brand, font } from "@/theme/tokens";
import { useErrorAlert } from "@/lib/alerts";

/**
 * Where the reset link lands.
 *
 * Supabase's recovery link carries the session on the URL fragment rather than
 * in the query string, and the client is created with `detectSessionInUrl:
 * false` because there is no URL bar on a phone to read it from. So this
 * screen does that job itself: pull the tokens out of the link that opened the
 * app, hand them to setSession, and only then let anyone type a new password.
 *
 * Without a recovery session updateUser has nobody to update, and the customer
 * would be told to sign in — which is exactly what they cannot do.
 */
export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { updatePassword } = useAuth();

  const [preparing, setPreparing] = useState(true);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Failures interrupt rather than sitting in red under the button.
  useErrorAlert(error);

  useEffect(() => {
    let cancelled = false;

    const adopt = async () => {
      // A session already in place — the link was followed a moment ago and
      // supabase-js has it, or the app was reopened while it is still valid.
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        if (!cancelled) { setReady(true); setPreparing(false); }
        return;
      }

      const url = await Linking.getInitialURL();
      const fragment = url?.includes("#") ? url.split("#")[1] : "";
      const params = new URLSearchParams(fragment);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error: setError_ } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!cancelled) {
          setReady(!setError_);
          setError(setError_?.message ?? null);
          setPreparing(false);
        }
        return;
      }

      if (!cancelled) {
        setError(t("resetLinkExpired"));
        setPreparing(false);
      }
    };

    adopt();
    return () => { cancelled = true; };
  }, [t]);

  const onSave = async () => {
    setError(null);
    // Same rules as signup. A reset that accepts a weaker password than
    // registration is a way around the policy, not a convenience.
    if (!isStrongPassword(password)) return setError(t("passwordRules"));
    if (password !== confirm) return setError(t("resetMismatch"));

    setSaving(true);
    const { error: saveError } = await updatePassword(password);
    setSaving(false);

    if (saveError) {
      setError(saveError);
      return;
    }

    // updateUser leaves them signed in, so there is no reason to send them
    // back to a login screen they have just proved they do not need.
    router.replace("/(tabs)");
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.body, { paddingTop: insets.top + 40 }]}>
        <Ionicons name="lock-open-outline" size={26} color={brand.midnight} />
        <Text style={styles.title}>{t("resetNewTitle")}</Text>

        {preparing ? (
          <ActivityIndicator color={brand.midnight} style={{ marginTop: 24 }} />
        ) : ready ? (
          <>
            <Text style={styles.subtitle}>{t("resetNewSubtitle")}</Text>

            <Text style={styles.label}>{t("resetNewPassword")}</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              editable={!saving}
              placeholder={t("passwordPlaceholder")}
            />
            <PasswordRules password={password} />

            <Text style={styles.label}>{t("resetRepeatPassword")}</Text>
            <TextInput
              style={styles.input}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              editable={!saving}
            />

            

            <BigButton
              label={t("resetSaveBtn")}
              tone="brand"
              onPress={onSave}
              loading={saving}
              iconRight="checkmark-circle-outline"
            />
          </>
        ) : (
          <View style={{ gap: 10 }}>
            <Text style={styles.error}>{error ?? t("resetLinkExpired")}</Text>
            <BigButton
              label={t("resetRequestAgain")}
              tone="brand"
              onPress={() => router.replace("/(auth)/forgot-password")}
              iconRight="refresh-outline"
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.background },
  body: { paddingHorizontal: 24, paddingBottom: 40, gap: 8 },
  title: { fontFamily: font.bold, fontSize: 26, color: brand.midnight, marginTop: 8 },
  subtitle: { fontFamily: font.regular, fontSize: 14, color: brand.moonstoneInk, marginBottom: 12 },
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
    marginBottom: 8,
  },
  error: { fontFamily: font.medium, fontSize: 13, color: "#c0392b", marginVertical: 6 },
});
