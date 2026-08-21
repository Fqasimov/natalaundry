import { useState } from "react";
import { View, Text, StyleSheet, Pressable, Share } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useProfile } from "@/lib/profile";
import { useI18n } from "@/lib/language-context";
import { font } from "@/theme/tokens";
import { Card, SettingsScaffold, settingsText, settingsUi } from "@/components/SettingsScaffold";

/**
 * Referral code.
 *
 * Derived from the profile id rather than stored: there is no referrals table
 * in the confirmed schema, and inventing one here would create a column the
 * server doesn't know about. A deterministic code is stable across devices and
 * can be reconciled to a user later without a migration.
 */
function referralCode(profileId: string | undefined, name: string | undefined): string {
  const initials = (name ?? "NATA").replace(/[^\p{L}]/gu, "").slice(0, 3).toUpperCase() || "NATA";
  const tail = (profileId ?? "").replace(/-/g, "").slice(-4).toUpperCase() || "0000";
  return `${initials}${tail}`;
}

export default function ReferralScreen() {
  const { profile } = useProfile();
  const { t } = useI18n();
  const [shared, setShared] = useState(false);

  const code = referralCode(profile?.id, profile?.name);

  // Share rather than copy-to-clipboard: it is what someone actually wants to
  // do with a referral code, and it needs no extra native module (and so no
  // rebuild) the way expo-clipboard would.
  const share = async () => {
    const result = await Share.share({ message: `${t("referralBody")} ${code}` });
    if (result.action === Share.sharedAction) {
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  };

  return (
    <SettingsScaffold title={t("referralTitle")}>
      <Card>
        <View style={settingsText.pad}>
          <Text style={settingsText.body}>{t("referralBody")}</Text>

          <Text style={[settingsText.body, { marginTop: 10 }]}>{t("referralYourCode")}</Text>
          <Pressable style={s.codeBox} onPress={share}>
            <Text style={s.code}>{code}</Text>
            <Ionicons
              name={shared ? "checkmark" : "share-social-outline"}
              size={20}
              color={settingsUi.accent}
            />
          </Pressable>

          <Pressable style={s.share} onPress={share}>
            <Ionicons name="share-social-outline" size={18} color="#fff" />
            <Text style={s.shareLabel}>{t("referralShare")}</Text>
          </Pressable>
        </View>
      </Card>
    </SettingsScaffold>
  );
}

const s = StyleSheet.create({
  codeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: settingsUi.accentSoft,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 4,
  },
  code: {
    flex: 1,
    fontFamily: font.extrabold,
    fontSize: 22,
    letterSpacing: 3,
    color: settingsUi.accent,
  },
  share: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: settingsUi.accent,
    borderRadius: 999,
    paddingVertical: 15,
    marginTop: 8,
  },
  shareLabel: { fontFamily: font.semibold, fontSize: 15, color: "#fff" },
});
