import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius } from "@/theme/tokens";
import { useI18n } from "@/lib/language-context";
import {
  BOX_DEFINITIONS,
  REWARD_DEFINITIONS,
  REWARD_TTL_DAYS,
  daysLeft,
  type ActiveReward,
  type BoxDefinition,
  type RewardKind,
} from "@/lib/rewards";
import { Pill, ScreenHeader } from "@/components/ui";

// "Hədiyyə Qutusu" — dark hero, the customer's unspent rewards, then the
// boxes they can open. Opening runs the tap-to-reveal flow from the video.
//
// Rewards are seeded locally until the API endpoint exists (see lib/rewards.ts
// for why the backing tables are still unconfirmed).
const SEED_REWARDS: ActiveReward[] = (
  [
    "balance_bonus",
    "free_express_delivery",
    "free_service",
    "eco_points",
    "eco_care_package",
    "vip_care_package",
  ] as RewardKind[]
).map((kind, index) => ({
  id: `seed-${index}`,
  kind,
  expiresAt: new Date(Date.now() + REWARD_TTL_DAYS * 86_400_000).toISOString(),
}));

export default function GiftBoxScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [rewards, setRewards] = useState<ActiveReward[]>(SEED_REWARDS);
  const [openingBox, setOpeningBox] = useState<BoxDefinition | null>(null);
  const [revealed, setRevealed] = useState<RewardKind | null>(null);
  const [claimed, setClaimed] = useState(false);

  const openBox = (box: BoxDefinition) => {
    setOpeningBox(box);
    setRevealed(null);
    setClaimed(false);
  };

  const reveal = () => {
    // The API decides the prize; this local pick only drives the animation
    // until that endpoint is wired up.
    const pool = Object.keys(REWARD_DEFINITIONS) as RewardKind[];
    setRevealed(pool[Math.floor(Math.random() * pool.length)]);
  };

  const claim = () => {
    if (revealed) {
      setRewards((prev) => [
        {
          id: `won-${Date.now()}`,
          kind: revealed,
          expiresAt: new Date(Date.now() + REWARD_TTL_DAYS * 86_400_000).toISOString(),
        },
        ...prev,
      ]);
    }
    setClaimed(true);
  };

  const closeAll = () => {
    setOpeningBox(null);
    setRevealed(null);
    setClaimed(false);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenHeader title={t("giftBox")} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="gift" size={40} color="#F6C445" />
          </View>
          <Text style={styles.heroTitle}>{t("giftBoxes")}</Text>
          <Text style={styles.heroBody}>{t("giftBoxesIntro")}</Text>
        </View>

        <Text style={styles.sectionLabel}>
          {t("activeRewards")} ({rewards.length})
        </Text>

        {rewards.map((reward) => {
          const def = REWARD_DEFINITIONS[reward.kind];
          const remaining = daysLeft(reward.expiresAt);
          return (
            <View key={reward.id} style={styles.rewardCard}>
              <LinearGradient colors={def.gradient} style={styles.rewardIcon}>
                <Ionicons name={def.icon as never} size={22} color={colors.textInverse} />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.rewardTitle}>{def.title}</Text>
                <Text style={styles.rewardDesc} numberOfLines={2}>
                  {def.description}
                </Text>
                <View style={styles.expiryRow}>
                  <Ionicons name="hourglass-outline" size={12} color={colors.danger} />
                  <Text style={styles.expiryLabel}>
                    {remaining} {t("daysLeft")} ({t("oneWeek")})
                  </Text>
                </View>
              </View>
              <Pressable style={styles.applyButton}>
                <Text style={styles.applyLabel}>{t("apply")}</Text>
              </Pressable>
            </View>
          );
        })}

        <Text style={styles.sectionLabel}>{t("availableBoxes")}</Text>

        {BOX_DEFINITIONS.map((box) => (
          <Pressable key={box.tier} style={styles.boxCard} onPress={() => openBox(box)}>
            <LinearGradient colors={box.gradient} style={styles.boxIcon}>
              <Ionicons name={box.icon as never} size={26} color={colors.textInverse} />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.boxTitle}>{box.title}</Text>
              <Text style={styles.boxDesc}>{box.description}</Text>
              {box.tier === "daily_bronze" ? (
                <View style={styles.readyRow}>
                  <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                  <Text style={styles.readyLabel}>{t("ready")}</Text>
                </View>
              ) : null}
            </View>
            <View style={{ alignItems: "flex-end", gap: 8 }}>
              <Pill label={box.badge} tone={box.badgeTone} />
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <Modal visible={!!openingBox} transparent animationType="fade" onRequestClose={closeAll}>
        <View style={styles.openBackdrop}>
          {!revealed ? (
            <Pressable style={styles.tapArea} onPress={reveal}>
              <LinearGradient
                colors={openingBox?.gradient ?? ["#FFD255", "#F0A81E"]}
                style={styles.chest}
              >
                <Ionicons name="cube" size={64} color={colors.textInverse} />
              </LinearGradient>
              <Text style={styles.tapLabel}>👆 {t("tapToOpen")}</Text>
            </Pressable>
          ) : claimed ? (
            <View style={styles.claimCard}>
              <Ionicons name="checkmark-circle" size={44} color={colors.success} />
              <Text style={styles.claimTitle}>{t("congrats")}</Text>
              <Text style={styles.claimBody}>
                {REWARD_DEFINITIONS[revealed].title} {t("addedToAccount")}
              </Text>
              <Pressable style={styles.okButton} onPress={closeAll}>
                <Text style={styles.okLabel}>{t("ok")}</Text>
              </Pressable>
            </View>
          ) : (
            <LinearGradient
              colors={REWARD_DEFINITIONS[revealed].gradient}
              style={styles.revealCard}
            >
              <View style={styles.revealBadge}>
                <Text style={styles.revealBadgeLabel}>
                  {REWARD_DEFINITIONS[revealed].kind === "discount_coupon"
                    ? "ENDİRİM KUPONU"
                    : "PULSUZ XİDMƏT"}
                </Text>
              </View>
              <Ionicons
                name={REWARD_DEFINITIONS[revealed].icon as never}
                size={52}
                color={colors.textInverse}
              />
              <Text style={styles.revealTitle}>{REWARD_DEFINITIONS[revealed].title}</Text>
              <Text style={styles.revealDesc}>{REWARD_DEFINITIONS[revealed].description}</Text>
              <View style={styles.ttlPill}>
                <Ionicons name="time-outline" size={13} color={colors.textInverse} />
                <Text style={styles.ttlLabel}>{t("useWithinWeek")}</Text>
              </View>
              <Pressable style={styles.claimButton} onPress={claim}>
                <Text style={styles.claimButtonLabel}>{t("claimReward")} ✓</Text>
              </Pressable>
            </LinearGradient>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  hero: { backgroundColor: colors.ink, borderRadius: radius.xl, padding: 24, alignItems: "center" },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { fontFamily: font.bold, fontSize: 22, color: colors.textInverse, marginTop: 14 },
  heroBody: {
    fontFamily: font.regular,
    fontSize: 13.5,
    lineHeight: 20,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
    marginTop: 8,
  },
  sectionLabel: {
    fontFamily: font.semibold,
    fontSize: 12.5,
    letterSpacing: 0.8,
    color: colors.textSecondary,
    marginTop: 24,
    marginBottom: 12,
  },
  rewardCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFDF2",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#F0E6C0",
    padding: 12,
    marginBottom: 10,
  },
  rewardIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  rewardTitle: { fontFamily: font.bold, fontSize: 15, color: colors.textPrimary },
  rewardDesc: { fontFamily: font.regular, fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
  expiryRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5 },
  expiryLabel: { fontFamily: font.medium, fontSize: 11.5, color: colors.danger },
  applyButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  applyLabel: { fontFamily: font.semibold, fontSize: 13, color: colors.textInverse },
  boxCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  boxIcon: { width: 54, height: 54, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  boxTitle: { fontFamily: font.bold, fontSize: 15.5, color: colors.textPrimary },
  boxDesc: { fontFamily: font.regular, fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
  readyRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5 },
  readyLabel: { fontFamily: font.semibold, fontSize: 12, color: colors.success },
  openBackdrop: {
    flex: 1,
    backgroundColor: "rgba(8,10,14,0.92)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  tapArea: { alignItems: "center", gap: 26 },
  chest: { width: 150, height: 150, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  tapLabel: { fontFamily: font.bold, fontSize: 17, color: "#FFD255", textAlign: "center" },
  revealCard: { width: "100%", borderRadius: radius.xl, padding: 26, alignItems: "center", gap: 10 },
  revealBadge: {
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 6,
  },
  revealBadgeLabel: { fontFamily: font.bold, fontSize: 11, color: colors.textInverse, letterSpacing: 0.8 },
  revealTitle: { fontFamily: font.bold, fontSize: 23, color: colors.textInverse, textAlign: "center" },
  revealDesc: {
    fontFamily: font.regular,
    fontSize: 13.5,
    color: "rgba(255,255,255,0.9)",
    textAlign: "center",
    lineHeight: 19,
  },
  ttlPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.22)",
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 6,
  },
  ttlLabel: { fontFamily: font.semibold, fontSize: 11, color: colors.textInverse, letterSpacing: 0.5 },
  claimButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 30,
    paddingVertical: 15,
    marginTop: 14,
  },
  claimButtonLabel: { fontFamily: font.bold, fontSize: 15, color: colors.textInverse },
  claimCard: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 26,
    alignItems: "center",
    gap: 10,
  },
  claimTitle: { fontFamily: font.bold, fontSize: 20, color: colors.textPrimary },
  claimBody: {
    fontFamily: font.regular,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  okButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 44,
    paddingVertical: 13,
    marginTop: 10,
  },
  okLabel: { fontFamily: font.semibold, fontSize: 15, color: colors.textInverse },
});
