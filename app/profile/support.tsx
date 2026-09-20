import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useI18n } from "@/lib/language-context";
import { font } from "@/theme/tokens";
import { Card, SettingsScaffold, settingsText, settingsUi } from "@/components/SettingsScaffold";

// Support contacts. Kept here rather than in i18n: they are the same in every
// language, and a phone number is not copy to be translated.
const SUPPORT_PHONE = "+994102055050";
const SUPPORT_EMAIL = "info@natalaundry.az";

// Google Play requires the privacy policy to be reachable from inside the app,
// not only from the store listing, and the app had no link to it anywhere.
//
// The host and the path are both deliberate. `natalaundry.az` has no A record
// at all — only `www` resolves — and the extensionless `/privacy` returns 403;
// the policy is served at `/privacy.html`. Pointing Play at the wrong one of
// these is what produced the "DNS name not found" rejection, so this URL is
// the one that was actually verified to return 200.
const PRIVACY_URL = "https://www.natalaundry.az/privacy.html";

export default function SupportScreen() {
  const { t } = useI18n();

  const rows: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; url: string }[] = [
    { icon: "call-outline", label: t("supportCall"), value: SUPPORT_PHONE, url: `tel:${SUPPORT_PHONE}` },
    {
      icon: "logo-whatsapp",
      label: t("supportWhatsapp"),
      value: SUPPORT_PHONE,
      url: `https://wa.me/${SUPPORT_PHONE.replace("+", "")}`,
    },
    { icon: "mail-outline", label: t("supportEmail"), value: SUPPORT_EMAIL, url: `mailto:${SUPPORT_EMAIL}` },
  ];

  return (
    <SettingsScaffold title={t("supportTitle")}>
      <Card>
        {rows.map((row, i) => (
          <View key={row.url}>
            {i > 0 ? <View style={s.divider} /> : null}
            <Pressable style={s.row} onPress={() => Linking.openURL(row.url)}>
              <Ionicons name={row.icon} size={22} color={settingsUi.accent} />
              <View style={{ flex: 1 }}>
                <Text style={s.label}>{row.label}</Text>
                <Text style={settingsText.body}>{row.value}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={settingsUi.accent} />
            </Pressable>
          </View>
        ))}
      </Card>

      <Card>
        <View style={settingsText.pad}>
          <Text style={settingsText.h2}>{t("supportHours")}</Text>
        </View>
      </Card>

      {/* Its own card rather than a fourth contact row: it is not a way of
          reaching us, and it carries no value line under the label. */}
      <Card>
        <Pressable style={s.row} onPress={() => Linking.openURL(PRIVACY_URL)}>
          <Ionicons name="shield-checkmark-outline" size={22} color={settingsUi.accent} />
          <Text style={[s.label, { flex: 1 }]}>{t("privacyPolicy")}</Text>
          <Ionicons name="open-outline" size={18} color={settingsUi.accent} />
        </Pressable>
      </Card>
    </SettingsScaffold>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 18, paddingVertical: 15 },
  label: { fontFamily: font.bold, fontSize: 16, color: settingsUi.ink },
  divider: { height: 1, backgroundColor: settingsUi.divider, marginLeft: 56 },
});
