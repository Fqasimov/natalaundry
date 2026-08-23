import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, money, radius } from "@/theme/tokens";
import { useI18n } from "@/lib/language-context";
import { Image } from "expo-image";
import { GiftBoxAnimation } from "@/components/GiftBoxAnimation";
import { GIFT_BOX_IMAGE } from "@/lib/gift-box-asset";
import { REWARD_PRESENTATION, REWARD_TTL_DAYS } from "@/lib/rewards";
import { useRewardCopy } from "@/lib/rewards-i18n";
import {
  fetchGiftBoxes,
  openGiftBox,
  type ActiveReward,
  type GiftBoxState,
  type UnopenedBox,
} from "@/lib/gift-boxes";
import { ScreenHeader } from "@/components/ui";

/**
 * "Hədiyyə Qutusu" — the boxes a customer's finalised orders have earned, and
 * the prizes they have already won and not yet spent.
 *
 * There is nothing to open until an order completes: a box *is* an order.
 */
export default function GiftBoxScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const copy = useRewardCopy();

  const [state, setState] = useState<GiftBoxState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [opening, setOpening] = useState<UnopenedBox | null>(null);
  const [lidUp, setLidUp] = useState(false);
  const [won, setWon] = useState<ActiveReward | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await fetchGiftBoxes());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  /**
   * The draw happens server-side. The request goes out first and the lid only
   * lifts once the prize is in hand, so the reveal can never show a prize the
   * server then refuses to grant.
   */
  const open = async (box: UnopenedBox) => {
    setOpening(box);
    setLidUp(false);
    setWon(null);
    try {
      const reward = await openGiftBox(box.order_id);
      setWon(reward);
      setLidUp(true);
    } catch (e) {
      setOpening(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const close = async () => {
    setOpening(null);
    setLidUp(false);
    setWon(null);
    await load();
  };

  const boxes = state?.boxes ?? [];
  const rewards = state?.active_rewards ?? [];
  const wonCopy = won ? copy.describe(won.kind, won.value, won) : null;

  return (
    <View style={[s.root, { paddingTop: insets.top + 4 }]}>
      <ScreenHeader title={t("giftBox")} backFallback="/(tabs)" />

      <ScrollView
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <LinearGradient colors={["#16233D", "#0D1B33"]} style={s.hero}>
          {GIFT_BOX_IMAGE ? (
            <Image source={GIFT_BOX_IMAGE} style={s.heroImage} contentFit="contain" />
          ) : (
            <GiftBoxAnimation opening={false} size={120} />
          )}
          <Text style={s.heroTitle}>{t("giftBoxes")}</Text>
          <Text style={s.heroBody}>{t("giftBoxesIntro")}</Text>
        </LinearGradient>

        {error ? <Text style={s.error}>{error}</Text> : null}

        {!state ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : (
          <>
            <Text style={s.section}>{t("availableBoxes")}</Text>
            {boxes.length === 0 ? (
              <View style={s.emptyCard}>
                <Ionicons name="cube-outline" size={22} color={colors.textSecondary} />
                <Text style={s.emptyLabel}>{t("giftBoxNone")}</Text>
              </View>
            ) : (
              boxes.map((box) => (
                <Pressable key={box.order_id} style={s.boxCard} onPress={() => open(box)}>
                  <LinearGradient colors={["#3184EC", "#1A6AD4"]} style={s.boxIcon}>
                    <Ionicons name="gift" size={24} color={colors.textInverse} />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={s.boxTitle}>{t("giftBoxReady")}</Text>
                    <Text style={s.boxSub}>
                      {t("giftBoxFromOrder", { no: box.order_no ?? "—" })} · {money(box.total)}
                    </Text>
                  </View>
                  <View style={s.openPill}>
                    <Text style={s.openLabel}>{t("giftBoxOpen")}</Text>
                  </View>
                </Pressable>
              ))
            )}

            <Text style={s.section}>
              {t("activeRewards")} ({rewards.length})
            </Text>
            {rewards.length === 0 ? (
              <View style={s.emptyCard}>
                <Ionicons name="pricetags-outline" size={22} color={colors.textSecondary} />
                <Text style={s.emptyLabel}>{t("rewardNone")}</Text>
              </View>
            ) : (
              rewards.map((reward) => {
                const look = REWARD_PRESENTATION[reward.kind];
                const text = copy.describe(reward.kind, reward.value, reward);
                return (
                  <View key={reward.id} style={s.rewardCard}>
                    <LinearGradient colors={look.gradient} style={s.rewardIcon}>
                      <Ionicons name={look.icon} size={20} color={colors.textInverse} />
                    </LinearGradient>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rewardTitle}>{text.title}</Text>
                      <Text style={s.rewardDesc} numberOfLines={2}>
                        {text.description}
                      </Text>
                      <Text style={s.expiry}>
                        {t("rewardExpiresIn", { days: reward.days_left })}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}

            <Text style={s.footnote}>{t("rewardExpiresIn", { days: REWARD_TTL_DAYS })}</Text>
          </>
        )}
      </ScrollView>

      {/* Reveal */}
      <Modal visible={opening !== null} transparent animationType="fade" onRequestClose={close}>
        <View style={s.modalBackdrop}>
          <GiftBoxAnimation opening={lidUp} size={200}>
            {wonCopy ? (
              <View style={s.prizeCard}>
                <LinearGradient
                  colors={won ? REWARD_PRESENTATION[won.kind].gradient : ["#fff", "#fff"]}
                  style={s.prizeIcon}
                >
                  <Ionicons
                    name={won ? REWARD_PRESENTATION[won.kind].icon : "gift"}
                    size={20}
                    color={colors.textInverse}
                  />
                </LinearGradient>
                <Text style={s.prizeTitle}>{wonCopy.title}</Text>
              </View>
            ) : null}
          </GiftBoxAnimation>

          {won ? (
            <View style={s.revealFoot}>
              <Text style={s.revealDesc}>{wonCopy?.description}</Text>
              <Pressable style={s.revealButton} onPress={close}>
                <Text style={s.revealButtonLabel}>{t("addedToAccount")}</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={s.revealDesc}>{t("giftBoxOpening")}</Text>
          )}
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: 20, gap: 12 },
  error: {
    fontFamily: font.regular,
    fontSize: 12.5,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  hero: { borderRadius: radius.lg, alignItems: "center", paddingVertical: 22, gap: 6 },
  heroImage: { width: 150, height: 150 },
  heroTitle: { fontFamily: font.bold, fontSize: 20, color: colors.textInverse },
  heroBody: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
    color: "rgba(255,255,255,0.72)",
    textAlign: "center",
    paddingHorizontal: 28,
  },

  section: {
    fontFamily: font.semibold,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.textSecondary,
    marginTop: 10,
  },

  emptyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: 16,
  },
  emptyLabel: { flex: 1, fontFamily: font.regular, fontSize: 13.5, color: colors.textSecondary },

  boxCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: 14,
  },
  boxIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  boxTitle: { fontFamily: font.bold, fontSize: 15, color: colors.textPrimary },
  boxSub: { fontFamily: font.regular, fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
  openPill: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  openLabel: { fontFamily: font.semibold, fontSize: 13, color: colors.textInverse },

  rewardCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  rewardIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rewardTitle: { fontFamily: font.semibold, fontSize: 14.5, color: colors.textPrimary },
  rewardDesc: { fontFamily: font.regular, fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
  expiry: { fontFamily: font.medium, fontSize: 11.5, color: colors.danger, marginTop: 5 },
  footnote: {
    fontFamily: font.regular,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 8,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(8,17,34,0.94)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  prizeCard: {
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: 18,
    paddingVertical: 14,
    maxWidth: 260,
  },
  prizeIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  prizeTitle: {
    fontFamily: font.bold,
    fontSize: 16,
    color: colors.textPrimary,
    textAlign: "center",
  },
  revealFoot: { alignItems: "center", gap: 14, marginTop: 10 },
  revealDesc: {
    fontFamily: font.regular,
    fontSize: 14,
    color: "rgba(255,255,255,0.78)",
    textAlign: "center",
    maxWidth: 280,
  },
  revealButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 30,
    paddingVertical: 14,
  },
  revealButtonLabel: { fontFamily: font.semibold, fontSize: 15, color: colors.textInverse },
});
