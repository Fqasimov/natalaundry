import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Modal,
  TextInput,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon } from "@/components/AppIcon";
import { ScreenHeader } from "@/components/ui";
import { brand, colors, font, money, radius, type } from "@/theme/tokens";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/language-context";
import type { WalletTransaction } from "@/types/database";
import {
  fetchWallet,
  startTopUp,
  waitForTopUp,
  topUpBonusFor,
  topUpBonusRate,
  TOPUP_BONUS_TIERS,
} from "@/lib/wallet";
import { BigButton } from "@/components/ui";
import { CARD_ENABLED } from "@/lib/payments";
import { useErrorAlert } from "@/lib/alerts";

// wallet_transactions columns are confirmed via the schema dump, and the
// running balance itself lives on profiles.wallet_balance (also confirmed)
// rather than being derived client-side — that's the authoritative number.

/**
 * `kind` is a database value, so it is translated rather than printed. An
 * unrecognised kind falls back to a neutral label plus the row's own note,
 * which is the part written for a person to read.
 */
const KIND_LABEL: Record<string, string> = {
  top_up: "walletKindTopUp",
  topup: "walletKindTopUp",
  order: "walletKindOrder",
  order_payment: "walletKindOrder",
  refund: "walletKindRefund",
  bonus: "walletKindBonus",
  reward: "walletKindBonus",
  referral: "walletKindReferral",
};

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { t, lang } = useI18n();
  const [transactions, setTransactions] = useState<WalletTransaction[] | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Failures interrupt rather than sitting in red under the button.
  useErrorAlert(error);
  const [refreshing, setRefreshing] = useState(false);

  // Top-up bounds come from the server — they are the only thing standing
  // between the gateway and an arbitrary amount, so the client shows them
  // rather than inventing its own.
  const [bounds, setBounds] = useState<{ min: number; max: number; presets: number[] }>({
    min: 5,
    max: 500,
    presets: [10, 20, 50, 100],
  });
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpBusy, setTopUpBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const userId = session?.user.id ?? null;

  const load = useCallback(async () => {
    if (!userId) {
      setTransactions([]);
      return;
    }
    const [{ data, error: err }, { data: profile }] = await Promise.all([
      supabase
        .from("wallet_transactions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("wallet_balance").eq("id", userId).single(),
    ]);

    if (err) {
      setError(err.message);
      return;
    }
    setError(null);
    setTransactions((data as WalletTransaction[]) ?? []);
    setBalance(Number(profile?.wallet_balance ?? 0));
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // The ledger and balance are read straight from Supabase above (fast, and
  // RLS already scopes them). The bounds are an API concern, so they come
  // from there and a failure just leaves the defaults in place.
  useEffect(() => {
    fetchWallet()
      .then((w) =>
        setBounds({ min: w.min_topup, max: w.max_topup, presets: w.topup_presets }),
      )
      .catch(() => undefined);
  }, []);

  /**
   * Opens the bank page for a top-up and settles up afterwards.
   *
   * Nothing about the outcome is inferred from the browser closing — the
   * customer may have paid and swiped it away, or reached a "success" page
   * that did not settle. The server is asked, exactly as order payment does.
   */
  const submitTopUp = async () => {
    const amount = Number(topUpAmount.replace(",", "."));
    // Bounded here for the button's sake; the server bounds it again, and
    // that is the check that counts.
    if (!Number.isFinite(amount) || amount < bounds.min || amount > bounds.max) return;

    setTopUpBusy(true);
    setNotice(null);
    try {
      const started = await startTopUp(amount, lang);
      try {
        await WebBrowser.openAuthSessionAsync(started.redirect_url, "natalaundry://wallet");
      } catch {
        // The browser failing to open says nothing about the payment.
      }
      const state = await waitForTopUp(started.topup_id);
      setNotice(state.settled ? t("walletTopUpDone") : t("walletTopUpPending"));
      setTopUpOpen(false);
      setTopUpAmount("");
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t("walletTopUpFailed"));
    } finally {
      setTopUpBusy(false);
    }
  };

  // Parsed once. The comma is accepted because an Azerbaijani or Russian
  // keyboard offers it as the decimal separator.
  const topUpValue = Number(topUpAmount.replace(",", "."));
  // Display only — the trigger recomputes this from the settled amount.
  const topUpBonus = topUpBonusFor(topUpValue);
  const topUpValid =
    Number.isFinite(topUpValue) &&
    topUpValue >= bounds.min &&
    topUpValue <= bounds.max;

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={[s.root, { paddingTop: insets.top + 4 }]}>
      <ScreenHeader title={t("myBalance")} backFallback="/(tabs)/profile" />

      {!transactions ? (
        <View style={s.center}>
          <ActivityIndicator color={brand.moonstoneInk} />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 32 }]}
          data={transactions}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={brand.moonstoneInk} />
          }
          ListHeaderComponent={
            <View style={s.header}>
              <View style={s.balanceCard}>
                <Text style={s.balanceLabel}>{t("wallet")}</Text>
                <Text style={s.balanceValue} numberOfLines={1}>
                  {money(balance ?? 0)}
                </Text>
                <Pressable
                  style={[s.topUpButton, !CARD_ENABLED && s.topUpButtonOff]}
                  disabled={!CARD_ENABLED}
                  accessibilityState={{ disabled: !CARD_ENABLED }}
                  onPress={() => {
                    // Preselect the smallest preset so the sheet opens on a
                    // usable action instead of a disabled zero.
                    if (topUpAmount === "") {
                      setTopUpAmount(String(bounds.presets[0] ?? bounds.min));
                    }
                    setTopUpOpen(true);
                  }}
                >
                  <AppIcon name="mci:plus" size={17} color={brand.moonstoneInk} />
                  <Text style={s.topUpLabel} numberOfLines={1}>
                    {t("walletTopUp")}
                  </Text>
                </Pressable>
              </View>
              <Text style={s.intro}>{t("walletIntro")}</Text>
              {/*
                Topping up is itself a card payment through the same gateway,
                so it goes off with card. Said plainly here: a top-up button
                that does nothing is worse than one that explains itself.
                Balance already held stays spendable at checkout.
              */}
              {!CARD_ENABLED ? (
                <Text style={s.topUpOffNote}>{t("walletTopUpUnavailable")}</Text>
              ) : null}
              {notice ? <Text style={s.notice}>{notice}</Text> : null}
              
            </View>
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <AppIcon name="mci:wallet-outline" size={30} color={brand.onSoftMuted} />
              <Text style={s.emptyLabel}>{t("walletNoTransactions")}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const credit = Number(item.amount) > 0;
            return (
              <View style={s.row}>
                <View style={s.rowText}>
                  <Text style={s.rowKind} numberOfLines={1}>
                    {t((KIND_LABEL[item.kind] ?? "walletKindOther") as never)}
                  </Text>
                  <Text style={s.rowNote}>
                    {item.note ??
                      new Date(item.created_at).toLocaleDateString(undefined, {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                  </Text>
                </View>
                <Text style={[s.rowAmount, credit ? s.credit : s.debit]}>
                  {credit ? "+" : "−"}
                  {money(Math.abs(Number(item.amount)))}
                </Text>
              </View>
            );
          }}
        />
      )}

      <Modal
        transparent
        visible={topUpOpen}
        animationType="fade"
        onRequestClose={() => setTopUpOpen(false)}
      >
        <View style={s.sheetBackdrop}>
          <View style={[s.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <Text style={s.sheetTitle}>{t("walletTopUpTitle")}</Text>
            <Text style={s.sheetBody}>{t("walletTopUpSubtitle")}</Text>

            <View style={s.presetRow}>
              {bounds.presets.map((preset) => {
                const active = Number(topUpAmount) === preset;
                const rate = topUpBonusRate(preset);
                return (
                  <Pressable
                    key={preset}
                    style={[s.preset, active && s.presetActive]}
                    onPress={() => setTopUpAmount(String(preset))}
                  >
                    <Text
                      style={[s.presetLabel, active && s.presetLabelActive]}
                      numberOfLines={1}
                    >
                      {money(preset)}
                    </Text>
                    {rate > 0 ? (
                      <Text style={s.presetBonus} numberOfLines={1}>
                        {t("walletBonusBadge", { percent: Math.round(rate * 100) })}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            <Text style={s.fieldLabel}>{t("walletTopUpAmount")}</Text>
            <TextInput
              style={s.input}
              keyboardType="decimal-pad"
              placeholder={t("amountPlaceholder")}
              placeholderTextColor={brand.onSoftMuted}
              value={topUpAmount}
              onChangeText={setTopUpAmount}
            />
            {topUpBonus > 0 ? (
              <View style={s.bonusNote}>
                <AppIcon name="mci:gift-outline" size={16} color={brand.onSoft} />
                <Text style={s.bonusNoteLabel} numberOfLines={2}>
                  {t("walletBonusEarned", {
                    percent: Math.round(topUpBonusRate(topUpValue) * 100),
                    bonus: money(topUpBonus),
                    total: money(topUpValue + topUpBonus),
                  })}
                </Text>
              </View>
            ) : (
              <Text style={s.bonusHint} numberOfLines={2}>
                {t("walletBonusHint", {
                  low: money(TOPUP_BONUS_TIERS[1].from),
                  lowPercent: Math.round(TOPUP_BONUS_TIERS[1].rate * 100),
                  high: money(TOPUP_BONUS_TIERS[0].from),
                  highPercent: Math.round(TOPUP_BONUS_TIERS[0].rate * 100),
                })}
              </Text>
            )}

            <Text style={s.bounds}>
              {t("walletTopUpBounds", {
                min: money(bounds.min),
                max: money(bounds.max),
              })}
            </Text>

            <BigButton
              tone="brand"
              label={
                // Naming a figure the button will not act on reads as broken;
                // fall back to the plain verb until the amount is usable.
                topUpValid
                  ? t("walletTopUpAction", { amount: money(topUpValue) })
                  : t("walletTopUp")
              }
              loading={topUpBusy}
              disabled={!topUpValid}
              onPress={submitTopUp}
            />
            <Pressable
              style={s.sheetCancel}
              onPress={() => setTopUpOpen(false)}
              disabled={topUpBusy}
            >
              <Text style={s.sheetCancelLabel}>{t("walletCancel")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 20, gap: 10 },
  header: { gap: 10, marginBottom: 6 },

  balanceCard: {
    backgroundColor: brand.moonstoneInk,
    borderRadius: radius.lg,
    padding: 20,
    gap: 4,
  },
  balanceLabel: { fontFamily: font.medium, fontSize: 13, color: "rgba(255,255,255,0.82)" },
  balanceValue: { fontFamily: font.extrabold, fontSize: 32, color: colors.textInverse },
  topUpButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  topUpLabel: { fontFamily: font.bold, fontSize: 13.5, color: brand.moonstoneInk },
  // Matches PaymentMethodPicker's rowDisabled, so a disabled control looks
  // the same wherever it appears.
  topUpButtonOff: { opacity: 0.45 },
  notice: {
    ...type.caption,
    color: brand.onSoft,
    backgroundColor: brand.moonstoneSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,69,84,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: brand.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 10,
  },
  sheetTitle: { fontFamily: font.bold, fontSize: 18, color: colors.textPrimary },
  sheetBody: { ...type.caption, color: brand.onSoftMuted, marginBottom: 4 },
  presetRow: { flexDirection: "row", gap: 8 },
  preset: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: brand.surfaceAlt,
  },
  presetActive: { borderColor: brand.moonstoneInk, backgroundColor: brand.moonstoneSoft },
  presetLabel: { fontFamily: font.semibold, fontSize: 13.5, color: brand.onSoftMuted },
  presetBonus: {
    fontFamily: font.bold,
    fontSize: 10,
    color: colors.success,
    marginTop: 2,
  },
  bonusNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: brand.moonstoneSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bonusNoteLabel: { flex: 1, ...type.caption, color: brand.onSoft },
  bonusHint: { ...type.caption, color: brand.onSoftMuted },
  presetLabelActive: { color: brand.moonstoneInk },
  fieldLabel: { fontFamily: font.medium, fontSize: 13.5, color: colors.textPrimary, marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontFamily: font.medium,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: brand.surface,
  },
  bounds: { ...type.caption, color: brand.onSoftMuted, marginBottom: 6 },
  sheetCancel: { alignItems: "center", paddingVertical: 12 },
  sheetCancelLabel: { fontFamily: font.medium, fontSize: 14.5, color: brand.onSoftMuted },
  intro: { ...type.caption, color: brand.onSoftMuted },
  topUpOffNote: {
    ...type.caption,
    color: brand.onSoft,
    backgroundColor: brand.moonstoneSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 10,
  },
  error: {
    ...type.caption,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  empty: { alignItems: "center", gap: 10, marginTop: 48 },
  emptyLabel: { ...type.body, color: brand.onSoftMuted },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: brand.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: brand.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowText: { flex: 1, gap: 2 },
  rowKind: { fontFamily: font.semibold, fontSize: 14, color: colors.textPrimary },
  rowNote: { ...type.caption, color: brand.onSoftMuted },
  rowAmount: { flexShrink: 0, fontFamily: font.bold, fontSize: 15 },
  credit: { color: colors.success },
  debit: { color: colors.textPrimary },
});
