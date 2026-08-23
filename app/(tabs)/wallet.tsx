import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon } from "@/components/AppIcon";
import { ScreenHeader } from "@/components/ui";
import { colors, font, money, radius, type } from "@/theme/tokens";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/language-context";
import type { WalletTransaction } from "@/types/database";

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
  const { t } = useI18n();
  const [transactions, setTransactions] = useState<WalletTransaction[] | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 32 }]}
          data={transactions}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListHeaderComponent={
            <View style={s.header}>
              <View style={s.balanceCard}>
                <Text style={s.balanceLabel}>{t("wallet")}</Text>
                <Text style={s.balanceValue}>{money(balance ?? 0)}</Text>
              </View>
              <Text style={s.intro}>{t("walletIntro")}</Text>
              {error ? <Text style={s.error}>{error}</Text> : null}
            </View>
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <AppIcon name="mci:wallet-outline" size={30} color={colors.textSecondary} />
              <Text style={s.emptyLabel}>{t("walletNoTransactions")}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const credit = Number(item.amount) > 0;
            return (
              <View style={s.row}>
                <View style={s.rowText}>
                  <Text style={s.rowKind}>
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
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 20, gap: 10 },
  header: { gap: 10, marginBottom: 6 },

  balanceCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: 20,
    gap: 4,
  },
  balanceLabel: { fontFamily: font.medium, fontSize: 13, color: "rgba(255,255,255,0.82)" },
  balanceValue: { fontFamily: font.extrabold, fontSize: 32, color: colors.textInverse },
  intro: { ...type.caption, color: colors.textSecondary },
  error: {
    ...type.caption,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  empty: { alignItems: "center", gap: 10, marginTop: 48 },
  emptyLabel: { ...type.body, color: colors.textSecondary },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowText: { flex: 1, gap: 2 },
  rowKind: { fontFamily: font.semibold, fontSize: 14, color: colors.textPrimary },
  rowNote: { ...type.caption, color: colors.textSecondary },
  rowAmount: { fontFamily: font.bold, fontSize: 15 },
  credit: { color: colors.success },
  debit: { color: colors.textPrimary },
});
