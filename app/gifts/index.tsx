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
import { brand, colors, font, money, radius } from "@/theme/tokens";
import { useI18n } from "@/lib/language-context";
import { Image } from "expo-image";
import { GiftBoxAnimation } from "@/components/GiftBoxAnimation";
import {
  GIFT_BOX_IMAGE,
  GIFT_BOX_REVEAL,
  GIFT_BOX_REVEAL_MS,
} from "@/lib/gift-box-asset";
import { REWARD_PRESENTATION, REWARD_TTL_DAYS } from "@/lib/rewards";
import { useRewardCopy } from "@/lib/rewards-i18n";
import {
  drawDemoReward,
  fetchGiftBoxesOrDemo,
  openGiftBox,
  type ActiveReward,
  type DemoFlag,
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

  const [state, setState] = useState<(GiftBoxState & DemoFlag) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [opening, setOpening] = useState<UnopenedBox | null>(null);
  const [lidUp, setLidUp] = useState(false);
  const [won, setWon] = useState<ActiveReward | null>(null);
  const [burst, setBurst] = useState(false);

  const load = useCallback(async () => {
    try {
      // Falls back to a labelled local sample when the API is unreachable, so
      // the reveal can still be exercised with no backend. A real API error
      // still surfaces — see lib/gift-boxes.ts.
      setState(await fetchGiftBoxesOrDemo());
      setError(null);
    } catch {
      // The message from the server is not something a customer can act on.
      setError(t("giftOffline"));
    }
  }, [t]);

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

    // Demo boxes are drawn locally — there is no server to ask, and asking
    // would fail. Nothing is granted; this only plays the animation.
    if (state?.demo) {
      setWon(drawDemoReward());
      setLidUp(true);
      return;
    }

    try {
      const reward = await openGiftBox(box.order_id);
      setWon(reward);
      setLidUp(true);
    } catch {
      setOpening(null);
      setError(t("giftOffline"));
    }
  };

  // The prize lands on the burst rather than the moment the request returns,
  // so a fast network does not skip the animation.
  useEffect(() => {
    if (!lidUp) {
      setBurst(false);
      return;
    }
    const timer = setTimeout(() => setBurst(true), GIFT_BOX_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [lidUp]);

  const close = async () => {
    setOpening(null);
    setLidUp(false);
    setWon(null);
    setBurst(false);
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={brand.moonstoneInk} />
        }
      >
        <LinearGradient colors={["#16233D", "#0D1B33"]} style={s.hero}>
          <Image source={GIFT_BOX_IMAGE} style={s.heroImage} contentFit="contain" />
          <Text style={s.heroTitle}>{t("giftBoxes")}</Text>
          <Text style={s.heroBody}>{t("giftBoxesIntro")}</Text>
        </LinearGradient>

        {error ? (
          <View style={s.errorCard}>
            <Ionicons name="cloud-offline-outline" size={18} color={colors.danger} />
            <Text style={s.error}>{error}</Text>
            <Pressable onPress={onRefresh} hitSlop={8}>
              <Text style={s.retry}>{t("retry")}</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Says plainly that this is sample data. The animation is the point
            of the screen and has to be viewable without a backend, but a
            demo prize must never read as one the customer actually won. */}
        {state?.demo ? (
          <View style={s.demoCard}>
            <View style={s.demoBadge}>
              <Text style={s.demoBadgeLabel}>{t("giftDemoBadge")}</Text>
            </View>
            <Text style={s.demoNote}>{t("giftDemoNote")}</Text>
          </View>
        ) : null}

        {!state ? (
          <ActivityIndicator color={brand.moonstoneInk} style={{ marginTop: 24 }} />
        ) : (
          <>
            <Text style={s.section}>{t("availableBoxes")}</Text>
            {boxes.length === 0 ? (
              <View style={s.emptyCard}>
                <Ionicons name="cube-outline" size={22} color={brand.onSoftMuted} />
                <Text style={s.emptyLabel}>{t("giftBoxNone")}</Text>
              </View>
            ) : (
              boxes.map((box) => (
                <Pressable key={box.order_id} style={s.boxCard} onPress={() => open(box)}>
                  <LinearGradient colors={[brand.heroFrom, brand.heroTo]} style={s.boxIcon}>
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
                <Ionicons name="pricetags-outline" size={22} color={brand.onSoftMuted} />
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

      {/* Reveal. The clip plays once and holds on the burst; the prize fades
          in on that beat, so the box reads as handing it over. */}
      <Modal visible={opening !== null} transparent animationType="fade" onRequestClose={close}>
        <View style={s.modalBackdrop}>
          <View style={s.revealStage}>
            {lidUp ? (
              <Image
                source={GIFT_BOX_REVEAL}
                style={s.revealClip}
                contentFit="contain"
                // Each opening must start from the closed box, so the clip is
                // remounted per reveal rather than resumed where it stopped.
                key={won?.id ?? "reveal"}
              />
            ) : (
              // Until the server has drawn a prize there is nothing to reveal,
              // so the drawn box keeps rocking rather than starting the clip.
              <GiftBoxAnimation opening={false} size={200} />
            )}

            {burst && wonCopy ? (
              <View style={s.prizeOverlay} pointerEvents="none">
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
              </View>
            ) : null}
          </View>

          {burst && won ? (
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
  root: { flex: 1, backgroundColor: brand.background },
  body: { paddingHorizontal: 20, gap: 12 },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  error: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.danger,
  },
  retry: { fontFamily: font.bold, fontSize: 12.5, color: colors.danger },

  demoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: brand.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  demoBadge: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
    // Keeps its size so the note beside it is what shrinks.
    flexShrink: 0,
  },
  demoBadgeLabel: { fontFamily: font.bold, fontSize: 10.5, color: colors.textInverse },
  demoNote: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 16.5,
    color: brand.onSoftMuted,
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
    color: brand.onSoftMuted,
    marginTop: 10,
  },

  emptyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: brand.surfaceAlt,
    borderRadius: radius.lg,
    padding: 16,
  },
  emptyLabel: { flex: 1, fontFamily: font.regular, fontSize: 13.5, color: brand.onSoftMuted },

  boxCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: brand.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: brand.moonstoneInk,
    padding: 14,
  },
  boxIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  boxTitle: { fontFamily: font.bold, fontSize: 15, color: colors.textPrimary },
  boxSub: { fontFamily: font.regular, fontSize: 12.5, color: brand.onSoftMuted, marginTop: 2 },
  openPill: {
    backgroundColor: brand.moonstoneInk,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  openLabel: { fontFamily: font.semibold, fontSize: 13, color: colors.textInverse },

  rewardCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: brand.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: brand.border,
    padding: 14,
  },
  rewardIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rewardTitle: { fontFamily: font.semibold, fontSize: 14.5, color: colors.textPrimary },
  rewardDesc: { fontFamily: font.regular, fontSize: 12.5, color: brand.onSoftMuted, marginTop: 2 },
  expiry: { fontFamily: font.medium, fontSize: 11.5, color: colors.danger, marginTop: 5 },
  footnote: {
    fontFamily: font.regular,
    fontSize: 12,
    color: brand.onSoftMuted,
    textAlign: "center",
    marginTop: 8,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(20,26,42,0.97)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  revealStage: { alignItems: "center", justifyContent: "center" },
  // Same navy the clip is rendered on, so its edge disappears into the
  // backdrop instead of reading as a pasted rectangle.
  revealClip: { width: 300, height: 300, borderRadius: 20 },
  prizeOverlay: { position: "absolute", alignItems: "center", justifyContent: "center" },
  prizeCard: {
    alignItems: "center",
    gap: 8,
    backgroundColor: brand.surface,
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
    backgroundColor: brand.moonstoneInk,
    borderRadius: radius.pill,
    paddingHorizontal: 30,
    paddingVertical: 14,
  },
  revealButtonLabel: { fontFamily: font.semibold, fontSize: 15, color: colors.textInverse },
});
