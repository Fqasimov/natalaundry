import { useState } from "react";
import { View, Text, TextInput, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { SettingsScaffold, Card, settingsText, settingsUi } from "@/components/SettingsScaffold";
import { AppIcon } from "@/components/AppIcon";
import { font, radius, type } from "@/theme/tokens";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/profile";
import { useI18n } from "@/lib/language-context";
import { useErrorAlert } from "@/lib/alerts";
import { deleteMyAccount } from "@/lib/account";

// Required by Google Play and App Store policy, but the screen is written for
// the customer rather than for the reviewer: it says what disappears, says what
// is kept and why, and makes the irreversible step deliberate.
//
// The gate is typing your own e-mail address rather than a native confirm
// dialog. Alert.alert's buttons are a no-op on react-native-web, so a dialog
// would be the only thing standing between a misplaced tap and a deleted
// account on the build that gets tested in a browser. Typing works everywhere,
// and it cannot be done by accident.
const ui = settingsUi;

export default function DeleteAccountScreen() {
  const { signOut } = useAuth();
  const { profile, isLoading } = useProfile();
  const { t } = useI18n();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useErrorAlert(error);

  const email = profile?.email ?? "";
  const confirmed = email.length > 0 && typed.trim().toLowerCase() === email.toLowerCase();

  const remove = async () => {
    if (!confirmed || busy) return;
    setBusy(true);
    setError(null);
    const result = await deleteMyAccount();
    if (!result.ok) {
      setError(t(result.reason));
      setBusy(false);
      return;
    }
    // The session now points at a user that no longer exists. Clearing it is
    // what returns the app to the signed-out stack; nothing else to route.
    await signOut();
  };

  if (isLoading) {
    return (
      <SettingsScaffold title={t("deleteAccount")}>
        <ActivityIndicator color={ui.ink} style={{ marginTop: 40 }} />
      </SettingsScaffold>
    );
  }

  return (
    <SettingsScaffold title={t("deleteAccount")}>
      <Card style={settingsText.radius}>
        <View style={settingsText.pad}>
          <View style={s.heading}>
            <AppIcon name="mci:alert-circle-outline" size={22} color={ui.danger} />
            <Text style={[settingsText.h2, { color: ui.danger }]}>
              {t("deleteAccountHeading")}
            </Text>
          </View>
          <Text style={settingsText.body}>{t("deleteAccountLead")}</Text>
        </View>
      </Card>

      <Card style={settingsText.radius}>
        <View style={settingsText.pad}>
          <Text style={settingsText.h2}>{t("deleteAccountRemovedTitle")}</Text>
          <Bullet>{t("deleteAccountRemoved1")}</Bullet>
          <Bullet>{t("deleteAccountRemoved2")}</Bullet>
          <Bullet>{t("deleteAccountRemoved3")}</Bullet>
        </View>
      </Card>

      <Card style={settingsText.radius}>
        <View style={settingsText.pad}>
          <Text style={settingsText.h2}>{t("deleteAccountKeptTitle")}</Text>
          <Text style={settingsText.body}>{t("deleteAccountKeptBody")}</Text>
        </View>
      </Card>

      <Card style={settingsText.radius}>
        <View style={settingsText.pad}>
          <Text style={settingsText.h2}>{t("deleteAccountConfirmTitle")}</Text>
          <Text style={settingsText.body}>
            {t("deleteAccountConfirmBody", { email: email || "—" })}
          </Text>
          <TextInput
            style={s.input}
            value={typed}
            onChangeText={setTyped}
            placeholder={t("deleteAccountPlaceholder")}
            placeholderTextColor={ui.inkSoft}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!busy}
          />
        </View>
      </Card>

      <Pressable
        style={({ pressed }) => [
          s.button,
          !confirmed && s.buttonDisabled,
          pressed && confirmed && { opacity: 0.85 },
        ]}
        onPress={remove}
        disabled={!confirmed || busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: !confirmed || busy }}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={s.buttonLabel}>{t("deleteAccountButton")}</Text>
        )}
      </Pressable>

      <Text style={s.footnote}>{t("deleteAccountFootnote")}</Text>
    </SettingsScaffold>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={s.bullet}>
      <Text style={s.bulletDot}>•</Text>
      <Text style={[settingsText.body, s.bulletText]}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  heading: { flexDirection: "row", alignItems: "center", gap: 8 },
  bullet: { flexDirection: "row", gap: 8, paddingRight: 4 },
  bulletDot: { ...type.body, color: settingsUi.inkSoft, lineHeight: 22 },
  bulletText: { flex: 1 },
  input: {
    backgroundColor: settingsUi.bg,
    borderWidth: 1,
    borderColor: settingsUi.border,
    borderRadius: radius.md,
    paddingHorizontal: 15,
    paddingVertical: 14,
    fontFamily: font.medium,
    fontSize: 15,
    color: settingsUi.ink,
    marginTop: 4,
  },
  button: {
    backgroundColor: settingsUi.danger,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  // Disabled is a flat grey rather than a faded red: a washed-out red still
  // reads as the button being armed.
  buttonDisabled: { backgroundColor: settingsUi.border },
  buttonLabel: { fontFamily: font.semibold, fontSize: 16, color: "#fff" },
  footnote: { ...type.caption, color: settingsUi.inkSoft, paddingHorizontal: 4 },
});
