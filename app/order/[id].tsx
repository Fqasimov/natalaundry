import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  ScrollView,
  Alert,
  TextInput,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/components/ui";
import { StatusBadge } from "@/components/StatusBadge";
import { brand, colors, font, money, radius, type } from "@/theme/tokens";
import { useI18n } from "@/lib/language-context";
import { isToplu, settleToplu } from "@/lib/toplu";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/profile";
import { LIFECYCLE_LABEL, isTracking, type LifecycleState } from "@/lib/lifecycle";
import {
  advanceOrderStatus,
  cancelOrder,
  claimOrder,
  fetchOrder,
  fetchOrderItems,
  recordTopluCount,
} from "@/lib/orders";
import type { Order, OrderItem } from "@/types/database";

/**
 * A single order, from whichever side the reader is on: the customer who
 * placed it, or the courier carrying it.
 */
export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { profile } = useProfile();
  const { t } = useI18n();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countInput, setCountInput] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [o, i] = await Promise.all([fetchOrder(id), fetchOrderItems(id)]);
      setOrder(o);
      setItems(i);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const isOwner = order && session?.user.id === order.user_id;
  const isMyJob = order && session?.user.id === order.courier_id;
  const isCourier = profile?.role === "courier";

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (error && !order) {
    return (
      <View style={s.center}>
        <Text style={s.error}>{error}</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={brand.moonstoneInk} />
      </View>
    );
  }

  const bulk = isToplu(order);
  const settlement = settleToplu(order);
  const state = order.lifecycle_state as LifecycleState | null;
  const paid = order.payment_status === "paid";

  const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <View style={s.row}>
      <Text style={[s.rowLabel, strong && s.rowStrong]}>{label}</Text>
      <Text style={[s.rowValue, strong && s.rowStrong]}>{value}</Text>
    </View>
  );

  return (
    <View style={[s.root, { paddingTop: insets.top + 4 }]}>
      <ScreenHeader title={t("orderNo", { no: order.order_no ?? "—" })} backFallback="/(tabs)" />

      <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 32 }]}>
        <View style={s.statusCard}>
          <View style={s.statusTop}>
            <Text style={s.statusLabel}>
              {state ? t(LIFECYCLE_LABEL[state] ?? "stateOrderPlaced") : ""}
            </Text>
            <StatusBadge status={order.status} />
          </View>
          {isOwner && isTracking(state) ? (
            <Pressable style={s.trackLink} onPress={() => router.push(`/track/${order.id}`)}>
              <Ionicons name="navigate" size={15} color={brand.moonstoneInk} />
              <Text style={s.trackLabel}>{t("trackOrder")}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>{t("pickupTime")}</Text>
          <Text style={s.cardBody}>{order.collection_time}</Text>
          <View style={s.divider} />
          <Text style={s.cardTitle}>{t("deliveryTime")}</Text>
          <Text style={s.cardBody}>{order.delivery_time}</Text>
          <View style={s.divider} />
          <Text style={s.cardTitle}>{t("orderAddress")}</Text>
          <Text style={s.cardBody}>{order.address ?? "—"}</Text>
          {order.notes ? (
            <>
              <View style={s.divider} />
              <Text style={s.cardTitle}>{t("orderNotes")}</Text>
              <Text style={s.cardBody}>{order.notes}</Text>
            </>
          ) : null}
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>{t("items")}</Text>
          {items.length === 0 ? (
            <Text style={s.muted}>{t("orderNoItems")}</Text>
          ) : (
            items.map((item) => (
              <Row
                key={item.id}
                label={`${item.item_name} × ${item.quantity}`}
                value={money(item.quantity * item.price)}
              />
            ))
          )}

          {bulk ? null : (
            <>
              <View style={s.divider} />
              <Row label={t("subtotal")} value={money(order.subtotal)} />
              {order.discount > 0 ? (
                <Row label={t("discount")} value={`-${money(order.discount)}`} />
              ) : null}
              {order.delivery_fee > 0 ? (
                <Row label={t("deliveryFee")} value={money(order.delivery_fee)} />
              ) : null}
              <View style={s.divider} />
              <Row label={t("total")} value={money(order.total)} strong />
            </>
          )}

          {bulk ? (
            <>
              <View style={s.divider} />
              <Row label={t("topluDepositPaid")} value={money(settlement.deposit)} />
              {settlement.counted ? (
                <>
                  <Row
                    label={t("topluCountedTotal")}
                    value={money(settlement.countedTotal ?? 0)}
                  />
                  <View style={s.divider} />
                  <View style={s.row}>
                    <Text style={[s.rowLabel, s.rowStrong]}>
                      {settlement.refund > 0 ? t("topluRefund") : t("topluBalanceDue")}
                    </Text>
                    <Text
                      style={[
                        s.rowValue,
                        s.rowStrong,
                        settlement.refund > 0 && { color: colors.success },
                      ]}
                    >
                      {money(settlement.refund > 0 ? settlement.refund : settlement.balanceDue)}
                    </Text>
                  </View>
                </>
              ) : (
                <View style={s.awaitingRow}>
                  <Ionicons name="hourglass-outline" size={15} color={brand.onSoftMuted} />
                  <Text style={s.awaitingLabel}>{t("topluNotCountedYet")}</Text>
                </View>
              )}
            </>
          ) : null}

          {/* Payment is one plain line. The raw column values used to be
              printed here, so an order with nothing set read "Payment method
              not set · pending" at the customer. */}
          <View style={s.divider} />
          <View style={s.paymentRow}>
            <Ionicons
              name={paid ? "checkmark-circle" : "cash-outline"}
              size={15}
              color={paid ? colors.success : brand.onSoftMuted}
            />
            <Text style={[s.paymentLabel, paid && { color: colors.success }]}>
              {paid ? t("orderPaid") : t("orderPaymentCash")}
            </Text>
          </View>
        </View>

        {error ? <Text style={s.error}>{error}</Text> : null}

        {isOwner && order.status === "pending" ? (
          <Pressable
            style={[s.dangerButton, busy && s.disabled]}
            disabled={busy}
            onPress={() =>
              Alert.alert(t("orderCancelConfirm"), undefined, [
                { text: t("orderCancelKeep"), style: "cancel" },
                {
                  text: t("orderCancel"),
                  style: "destructive",
                  onPress: () => withBusy(() => cancelOrder(order.id)),
                },
              ])
            }
          >
            <Text style={s.dangerLabel}>{t("orderCancel")}</Text>
          </Pressable>
        ) : null}

        {isCourier && order.status === "pending" && !order.courier_id && session ? (
          <Pressable
            style={[s.primaryButton, busy && s.disabled]}
            disabled={busy}
            onPress={() => withBusy(() => claimOrder(order.id, session.user.id))}
          >
            {busy ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={s.primaryLabel}>{t("orderAcceptJob")}</Text>
            )}
          </Pressable>
        ) : null}

        {isMyJob && bulk && !settlement.counted && session ? (
          <View style={s.countBox}>
            <Text style={s.countTitle}>{t("topluCountPrompt")}</Text>
            <View style={s.countRow}>
              <TextInput
                style={s.countInput}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={brand.onSoftMuted}
                value={countInput}
                onChangeText={setCountInput}
              />
              <Pressable
                style={[
                  s.countButton,
                  (busy || !Number.isFinite(Number(countInput)) || countInput.trim() === "") &&
                    s.disabled,
                ]}
                disabled={busy || !Number.isFinite(Number(countInput)) || countInput.trim() === ""}
                onPress={() =>
                  withBusy(() => recordTopluCount(order.id, session.user.id, Number(countInput)))
                }
              >
                <Text style={s.countButtonLabel}>{t("topluCountAction")}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {isMyJob && ["collecting", "cleaning", "delivering"].includes(order.status) ? (
          <Pressable
            style={[s.primaryButton, busy && s.disabled]}
            disabled={busy}
            onPress={() => withBusy(async () => void (await advanceOrderStatus(order.id, order.status)))}
          >
            {busy ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={s.primaryLabel}>{t("orderNextStep")}</Text>
            )}
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: brand.background,
    padding: 24,
  },
  body: { paddingHorizontal: 20, gap: 12 },
  error: {
    ...type.caption,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  muted: { ...type.body, color: brand.onSoftMuted },

  statusCard: {
    backgroundColor: brand.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: brand.border,
    padding: 16,
    gap: 10,
  },
  statusTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusLabel: { flex: 1, fontFamily: font.bold, fontSize: 17, color: colors.textPrimary },
  trackLink: { flexDirection: "row", alignItems: "center", gap: 7 },
  trackLabel: { fontFamily: font.semibold, fontSize: 14, color: brand.moonstoneInk },

  card: {
    backgroundColor: brand.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: brand.border,
    padding: 16,
    gap: 5,
  },
  cardTitle: { ...type.caption, color: brand.onSoftMuted },
  cardBody: { ...type.body, color: colors.textPrimary },
  divider: { height: 1, backgroundColor: brand.border, marginVertical: 9 },

  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  rowLabel: { ...type.body, flex: 1, color: brand.onSoftMuted },
  rowValue: { ...type.body, color: colors.textPrimary },
  rowStrong: { fontFamily: font.bold, fontSize: 16, color: colors.textPrimary },

  awaitingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  awaitingLabel: { ...type.caption, flex: 1, color: brand.onSoftMuted },
  paymentRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  paymentLabel: { ...type.caption, color: brand.onSoftMuted },

  primaryButton: {
    backgroundColor: brand.moonstoneInk,
    borderRadius: radius.pill,
    paddingVertical: 15,
    alignItems: "center",
  },
  primaryLabel: { fontFamily: font.semibold, fontSize: 15, color: colors.textInverse },
  dangerButton: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.pill,
    paddingVertical: 14,
    alignItems: "center",
  },
  dangerLabel: { fontFamily: font.semibold, fontSize: 15, color: colors.danger },
  disabled: { opacity: 0.5 },

  countBox: {
    backgroundColor: brand.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: brand.border,
    padding: 16,
    gap: 10,
  },
  countTitle: { ...type.body, color: colors.textPrimary },
  countRow: { flexDirection: "row", gap: 10 },
  countInput: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: brand.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  countButton: {
    backgroundColor: brand.moonstoneInk,
    borderRadius: radius.sm,
    paddingHorizontal: 18,
    justifyContent: "center",
  },
  countButtonLabel: { fontFamily: font.semibold, fontSize: 14, color: colors.textInverse },
});
