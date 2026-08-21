import { View, Text, StyleSheet } from "react-native";
import { useProfile } from "@/lib/profile";
import { useI18n } from "@/lib/language-context";
import { MEMBERSHIP_TIERS, nextTierFor, pointsToNextTier, tierFor } from "@/lib/membership";
import { AppIcon } from "@/components/AppIcon";
import { font } from "@/theme/tokens";
import { Card, SettingsScaffold, settingsText, settingsUi } from "@/components/SettingsScaffold";

/** The whole ladder, with the customer's position on it. */
export default function LevelScreen() {
  const { profile } = useProfile();
  const { t } = useI18n();

  const points = profile?.points ?? 0;
  const tier = tierFor(points);
  const next = nextTierFor(points);
  const remaining = pointsToNextTier(points);

  // Progress within the current band, so the bar fills as points accrue
  // rather than jumping only when the tier changes.
  const span = next ? next.threshold - tier.threshold : 1;
  const progress = next ? Math.min(1, Math.max(0, (points - tier.threshold) / span)) : 1;

  return (
    <SettingsScaffold title={t("levelTitle")}>
      <Card>
        <View style={settingsText.pad}>
          <View style={s.badgeRow}>
            <View style={[s.badge, { backgroundColor: tier.tint }]}>
              <AppIcon name="mci:medal-outline" size={22} color={tier.fg} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={settingsText.h1}>{tier.name}</Text>
              <Text style={settingsText.body}>{t("levelPoints", { points })}</Text>
            </View>
          </View>

          <View style={s.track}>
            <View style={[s.fill, { width: `${progress * 100}%`, backgroundColor: tier.fg }]} />
          </View>
          <Text style={settingsText.body}>
            {next && remaining !== null
              ? t("levelNext", { name: next.name, points: remaining })
              : t("levelTop")}
          </Text>
        </View>
      </Card>

      <Card>
        {MEMBERSHIP_TIERS.map((entry, i) => (
          <View key={entry.key}>
            {i > 0 ? <View style={s.divider} /> : null}
            <View style={s.tierRow}>
              <View style={[s.dot, { backgroundColor: entry.tint }]} />
              <Text
                style={[
                  s.tierName,
                  entry.key === tier.key && { fontFamily: font.extrabold, color: entry.fg },
                ]}
              >
                {entry.name}
              </Text>
              <Text style={settingsText.body}>{t("levelPoints", { points: entry.threshold })}</Text>
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <View style={settingsText.pad}>
          <Text style={settingsText.h2}>{t("levelHowTitle")}</Text>
          <Text style={settingsText.body}>{t("levelHowBody")}</Text>
        </View>
      </Card>
    </SettingsScaffold>
  );
}

const s = StyleSheet.create({
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  badge: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: settingsUi.divider,
    overflow: "hidden",
    marginTop: 8,
  },
  fill: { height: 8, borderRadius: 4 },
  tierRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 15 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  tierName: { flex: 1, fontFamily: font.bold, fontSize: 15, color: settingsUi.ink },
  divider: { height: 1, backgroundColor: settingsUi.divider, marginLeft: 18 },
});
