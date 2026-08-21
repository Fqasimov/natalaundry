import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius, type } from "@/theme/tokens";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/profile";
import { useI18n } from "@/lib/language-context";
import { supabase } from "@/lib/supabase";
import { BigButton, ScreenHeader } from "@/components/ui";

// profiles.name/phone are the confirmed editable fields — customer_details/
// courier_details turned out to hold system-managed stuff instead
// (stripe_customer_id, courier vehicle/location), not profile display info.
// Email comes from Supabase Auth, so it's shown read-only here.
export default function PersonalDetailsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { profile, isLoading } = useProfile();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? "");
      setPhone(profile.phone ?? "");
    }
  }, [profile]);

  const save = async () => {
    if (!session?.user.id) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const { error: saveError } = await supabase
      .from("profiles")
      .update({ name, phone })
      .eq("id", session.user.id);
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setSaved(true);
  };

  if (isLoading || !profile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 4 }]}>
      <ScreenHeader title={t("personalInfo")} />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.field}>
          <Text style={styles.label}>{t("name")}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={(v) => {
              setName(v);
              setSaved(false);
            }}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t("phone")}</Text>
          <TextInput
            style={styles.input}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={(v) => {
              setPhone(v);
              setSaved(false);
            }}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t("email")}</Text>
          <View style={[styles.input, styles.inputReadOnly]}>
            <Text style={styles.readOnlyValue}>
              {profile.email ?? session?.user.email ?? "—"}
            </Text>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {saved ? <Text style={styles.saved}>{t("saved")}</Text> : null}

        <BigButton
          label={t("save")}
          tone="primary"
          onPress={save}
          loading={saving}
          style={styles.saveButton}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  body: { paddingHorizontal: 20, paddingTop: 8, gap: 18 },
  field: { gap: 7 },
  label: { ...type.bodyMedium, fontSize: 13.5, color: colors.textSecondary },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 15,
    paddingVertical: 15,
    fontFamily: font.medium,
    fontSize: 15,
    color: colors.textPrimary,
  },
  inputReadOnly: { backgroundColor: colors.surfaceAlt, justifyContent: "center" },
  readOnlyValue: { fontFamily: font.medium, fontSize: 15, color: colors.textSecondary },
  error: { ...type.caption, color: colors.danger },
  saved: { ...type.caption, color: colors.success },
  saveButton: { marginTop: 6 },
});
