import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { brand, colors, font, radius, type } from "@/theme/tokens";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/profile";
import { useI18n } from "@/lib/language-context";
import { supabase } from "@/lib/supabase";
import { ScreenHeader } from "@/components/ui";
import { useErrorAlert } from "@/lib/alerts";

// Deliberately the quietest screen in the app: a form, on white, with no
// accent colour competing for the eye. It keeps that restraint, but the greys
// now come from the coastal palette so they don't read as a cold cast against
// the teal-tinted chrome around them.
const mono = {
  bg: brand.surface,
  surface: brand.surface,
  bubble: brand.aliceBlue,
  border: brand.border,
  ink: colors.textPrimary,
  inkSoft: brand.onSoftMuted,
  inverse: colors.textInverse,
} as const;

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
  // Failures interrupt rather than sitting in red under the button.
  useErrorAlert(error);

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
        <ActivityIndicator color={mono.ink} />
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

        
        {saved ? <Text style={styles.saved}>{t("saved")}</Text> : null}

        {/* BigButton is tied to the app's colour tones, so this screen uses a
            plain black pill to stay monochrome. */}
        <Pressable
          style={({ pressed }) => [styles.saveButton, pressed && { opacity: 0.85 }]}
          onPress={save}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={mono.inverse} />
          ) : (
            <Text style={styles.saveLabel}>{t("save")}</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: mono.bg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: mono.bg,
  },
  body: { paddingHorizontal: 20, paddingTop: 8, gap: 18 },
  field: { gap: 7 },
  label: { ...type.bodyMedium, fontSize: 13.5, color: mono.inkSoft },
  input: {
    backgroundColor: mono.surface,
    borderWidth: 1,
    borderColor: mono.border,
    borderRadius: radius.md,
    paddingHorizontal: 15,
    paddingVertical: 15,
    fontFamily: font.medium,
    fontSize: 15,
    color: mono.ink,
  },
  inputReadOnly: { backgroundColor: mono.bubble, justifyContent: "center" },
  readOnlyValue: { fontFamily: font.medium, fontSize: 15, color: mono.inkSoft },
  error: { ...type.caption, color: mono.ink, fontFamily: font.semibold },
  saved: { ...type.caption, color: mono.inkSoft },
  saveButton: {
    backgroundColor: mono.ink,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  saveLabel: { fontFamily: font.semibold, fontSize: 16, color: mono.inverse },
});
