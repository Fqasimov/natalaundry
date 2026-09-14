import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Share, ActivityIndicator } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { useProfile } from "@/lib/profile";
import { useI18n } from "@/lib/language-context";
import { brand, colors, font, money, radius, type } from "@/theme/tokens";
import { SettingsScaffold, settingsUi } from "@/components/SettingsScaffold";
import {
  REFERRAL_BONUS,
  fetchReferralStats,
  referralCodeFor,
  type ReferralStats,
} from "@/lib/referrals";

/**
 * "Dostunu dəvət et" — the referral screen.
 *
 * Built to the supplied design: the offer, the code, what it has earned so
 * far, how it works, and who has used it. The counts come from the
 * `referrals` table and read zero until supabase/referrals.sql is applied —
 * see lib/referrals.ts for why that degrades rather than throws.
 */
export default function ReferralScreen() {
  const { profile } = useProfile();
  const { t } = useI18n();

  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [copied, setCopied] = useState(false);

  const code = referralCodeFor(profile?.id);
  const bonus = money(REFERRAL_BONUS);

  const load = useCallback(async () => {
    try {
      setStats(await fetchReferralStats());
    } catch {
      // The screen's job is the code; the list is extra. Showing none is
      // better than showing an error over the thing they came here for.
      setStats({ invited: 0, completed: 0, friends: [] });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const copy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const share = () => {
    void Share.share({
      message: `${t("referralHeroBody", { amount: bonus })}\n\n${t("referralCodeLabel")}: ${code}`,
    });
  };

  return (
    <SettingsScaffold title={t("referralTitle")}>
      {/* The offer, in one line. */}
      <View style={s.hero}>
        <Text style={s.heroTitle}>{t("referralHeroTitle")}</Text>
        <Text style={s.heroBody}>{t("referralHeroBody", { amount: bonus })}</Text>
      </View>

      {/* The code. Copy rather than share: the common case is pasting it into
          a chat that is already open. Share is the button at the bottom. */}
      <View style={s.card}>
        <Text style={s.cardLabel}>{t("referralCodeLabel")}</Text>
        <View style={s.codeRow}>
          <Text style={s.code} numberOfLines={1} adjustsFontSizeToFit>
            {code || "—"}
          </Text>
          <Pressable style={s.copyButton} onPress={copy} disabled={!code}>
            <Text style={s.copyLabel} numberOfLines={1}>
              {copied ? t("referralCopied") : t("referralCopy")}
            </Text>
          </Pressable>
        </View>
        <Text style={s.cardHint}>{t("referralCodeHint")}</Text>
      </View>

      <View style={s.statRow}>
        <View style={s.stat}>
          <Text style={s.statLabel} numberOfLines={1}>
            {t("referralInvited")}
          </Text>
          <Text style={s.statValue}>{stats ? stats.invited : "—"}</Text>
        </View>
        <View style={s.stat}>
          <Text style={s.statLabel} numberOfLines={1}>
            {t("referralCompleted")}
          </Text>
          <Text style={s.statValue}>{stats ? stats.completed : "—"}</Text>
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.howTitle}>{t("referralHowTitle")}</Text>
        {[
          t("referralHow1"),
          t("referralHow2", { amount: bonus }),
          t("referralHow3", { amount: bonus }),
        ].map((line) => (
          <Text key={line} style={s.howLine}>
            {line}
          </Text>
        ))}
      </View>

      <Text style={s.sectionTitle}>{t("referralFriendsTitle")}</Text>
      {!stats ? (
        <ActivityIndicator color={settingsUi.accent} style={{ marginVertical: 20 }} />
      ) : stats.friends.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyLabel}>{t("referralFriendsEmpty")}</Text>
        </View>
      ) : (
        <View style={s.card}>
          {stats.friends.map((friend, i) => (
            <View key={friend.id}>
              {i > 0 ? <View style={s.divider} /> : null}
              <View style={s.friendRow}>
                <View style={[s.friendDot, friend.completed && s.friendDotDone]} />
                <Text style={s.friendName} numberOfLines={1}>
                  {friend.name || t("referralAnonymous")}
                </Text>
                <Text
                  style={[s.friendState, friend.completed && s.friendStateDone]}
                  numberOfLines={1}
                >
                  {friend.completed ? t("referralFriendCompleted") : t("referralFriendJoined")}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <Pressable style={s.share} onPress={share} disabled={!code}>
        <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
        <Text style={s.shareLabel} numberOfLines={1}>
          {t("referralShare")}
        </Text>
      </Pressable>
    </SettingsScaffold>
  );
}

const s = StyleSheet.create({
  hero: {
    backgroundColor: brand.moonstoneSoft,
    borderRadius: 18,
    padding: 18,
    gap: 6,
  },
  heroTitle: { fontFamily: font.bold, fontSize: 17, lineHeight: 23, color: settingsUi.ink },
  heroBody: { ...type.body, color: brand.onSoft },

  card: {
    backgroundColor: settingsUi.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: settingsUi.border,
    padding: 18,
    gap: 8,
  },
  cardLabel: { ...type.caption, color: settingsUi.inkSoft },
  codeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  code: {
    flex: 1,
    fontFamily: font.extrabold,
    fontSize: 28,
    letterSpacing: 1.5,
    color: settingsUi.ink,
  },
  copyButton: {
    flexShrink: 0,
    backgroundColor: settingsUi.accentSoft,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  copyLabel: { fontFamily: font.semibold, fontSize: 13.5, color: settingsUi.accent },
  cardHint: { ...type.caption, color: settingsUi.inkSoft },

  statRow: { flexDirection: "row", gap: 12 },
  stat: {
    flex: 1,
    backgroundColor: settingsUi.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: settingsUi.border,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 4,
  },
  statLabel: { ...type.caption, color: settingsUi.inkSoft },
  statValue: { fontFamily: font.extrabold, fontSize: 26, color: settingsUi.ink },

  howTitle: { fontFamily: font.bold, fontSize: 16, color: settingsUi.ink, marginBottom: 2 },
  howLine: { ...type.body, color: settingsUi.inkSoft },

  sectionTitle: {
    fontFamily: font.bold,
    fontSize: 16,
    color: settingsUi.ink,
    paddingHorizontal: 4,
    marginTop: 4,
  },
  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: settingsUi.border,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 26,
    alignItems: "center",
  },
  emptyLabel: { ...type.body, color: settingsUi.inkSoft, textAlign: "center" },

  friendRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  friendDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: settingsUi.border },
  friendDotDone: { backgroundColor: colors.success },
  friendName: { flex: 1, fontFamily: font.semibold, fontSize: 15, color: settingsUi.ink },
  friendState: { ...type.caption, flexShrink: 0, color: settingsUi.inkSoft },
  friendStateDone: { color: colors.success },

  divider: { height: 1, backgroundColor: settingsUi.divider },

  share: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: brand.lightBlue,
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginTop: 4,
  },
  shareLabel: { fontFamily: font.bold, fontSize: 15.5, color: brand.midnight },
});
