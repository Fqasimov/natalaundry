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
import { Stack, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { StatusBadge } from "@/components/StatusBadge";
import { colors, money } from "@/theme/tokens";
import { useI18n } from "@/lib/language-context";
import { isToplu, settleToplu } from "@/lib/toplu";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/profile";
import {
  advanceOrderStatus,
  cancelOrder,
  claimOrder,
  fetchOrder,
  fetchOrderItems,
  recordTopluCount,
} from "@/lib/orders";
import type { Order, OrderItem } from "@/types/database";

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
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
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const bulk = isToplu(order);
  const settlement = settleToplu(order);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: `Order #${order.order_no}` }} />
      <ScrollView contentContainerStyle={styles.container}>
        <StatusBadge status={order.status} />

        <Text style={styles.section}>Pickup / delivery</Text>
        <Text style={styles.value}>{order.collection_time}</Text>
        <Text style={styles.value}>{order.delivery_time}</Text>

        <Text style={styles.section}>Address</Text>
        <Text style={styles.value}>{order.address ?? "—"}</Text>

        {order.notes ? (
          <>
            <Text style={styles.section}>Notes</Text>
            <Text style={styles.value}>{order.notes}</Text>
          </>
        ) : null}

        <Text style={styles.section}>Items</Text>
        {items.length === 0 ? (
          <Text style={styles.value}>No items recorded</Text>
        ) : (
          items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <Text style={styles.value}>
                {item.item_name} × {item.quantity}
              </Text>
              <Text style={styles.value}>{(item.quantity * item.price).toFixed(2)}</Text>
            </View>
          ))
        )}

        {bulk ? null : (
          <View style={styles.itemRow}>
            <Text style={styles.value}>Subtotal</Text>
            <Text style={styles.value}>{order.subtotal.toFixed(2)}</Text>
          </View>
        )}
        {order.discount > 0 && (
          <View style={styles.itemRow}>
            <Text style={styles.value}>Discount</Text>
            <Text style={styles.value}>-{order.discount.toFixed(2)}</Text>
          </View>
        )}
        {order.delivery_fee > 0 && (
          <View style={styles.itemRow}>
            <Text style={styles.value}>Delivery fee</Text>
            <Text style={styles.value}>{order.delivery_fee.toFixed(2)}</Text>
          </View>
        )}
        {bulk ? (
          <View style={styles.bulkBox}>
            <View style={styles.itemRow}>
              <Text style={styles.value}>{t("topluDepositPaid")}</Text>
              <Text style={styles.value}>{money(settlement.deposit)}</Text>
            </View>

            {settlement.counted ? (
              <>
                <View style={styles.itemRow}>
                  <Text style={styles.value}>{t("topluCountedTotal")}</Text>
                  <Text style={styles.value}>{money(settlement.countedTotal ?? 0)}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>
                    {settlement.refund > 0 ? t("topluRefund") : t("topluBalanceDue")}
                  </Text>
                  <Text
                    style={[
                      styles.totalLabel,
                      { color: settlement.refund > 0 ? colors.success : colors.textPrimary },
                    ]}
                  >
                    {money(settlement.refund > 0 ? settlement.refund : settlement.balanceDue)}
                  </Text>
                </View>
              </>
            ) : (
              <View style={styles.awaitingRow}>
                <Ionicons name="hourglass-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.awaitingLabel}>{t("topluNotCountedYet")}</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalLabel}>{order.total.toFixed(2)}</Text>
          </View>
        )}
        <Text style={styles.paymentNote}>
          {order.payment_method ?? "Payment method not set"} · {order.payment_status ?? "pending"}
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Customer actions */}
        {isOwner && order.status === "pending" && (
          <Pressable
            style={styles.dangerButton}
            disabled={busy}
            onPress={() =>
              Alert.alert("Cancel order?", undefined, [
                { text: "Keep it", style: "cancel" },
                { text: "Cancel order", style: "destructive", onPress: () => withBusy(() => cancelOrder(order.id)) },
              ])
            }
          >
            <Text style={styles.dangerButtonText}>Cancel order</Text>
          </Pressable>
        )}

        {/* Courier actions */}
        {isCourier && order.status === "pending" && !order.courier_id && session && (
          <Pressable
            style={styles.primaryButton}
            disabled={busy}
            onPress={() => withBusy(() => claimOrder(order.id, session.user.id))}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Accept job</Text>}
          </Pressable>
        )}

        {isMyJob && bulk && !settlement.counted && session && (
          <View style={styles.countBox}>
            <Text style={styles.countTitle}>{t("topluCountPrompt")}</Text>
            <View style={styles.countRow}>
              <TextInput
                style={styles.countInput}
                keyboardType="decimal-pad"
                placeholder="0.00"
                value={countInput}
                onChangeText={setCountInput}
              />
              <Pressable
                style={styles.countButton}
                disabled={busy || !Number.isFinite(Number(countInput)) || countInput.trim() === ""}
                onPress={() =>
                  withBusy(() =>
                    recordTopluCount(order.id, session.user.id, Number(countInput))
                  )
                }
              >
                <Text style={styles.countButtonLabel}>{t("topluCountAction")}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {isMyJob && ["collecting", "cleaning", "delivering"].includes(order.status) && (
          <Pressable
            style={styles.primaryButton}
            disabled={busy}
            onPress={() => withBusy(async () => void (await advanceOrderStatus(order.id, order.status)))}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Mark as next step</Text>
            )}
          </Pressable>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 20, paddingBottom: 60, gap: 4 },
  section: { fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 14, marginTop: 18, color: "#666" },
  value: { fontFamily: "PlusJakartaSans_400Regular", fontSize: 15 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  totalLabel: { fontFamily: "PlusJakartaSans_700Bold" },
  bulkBox: { marginTop: 8 },
  countBox: {
    marginTop: 24,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#F1F1F4",
  },
  countTitle: { fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 14, marginBottom: 10 },
  countRow: { flexDirection: "row", gap: 10 },
  countInput: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#DAD8CA",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "PlusJakartaSans_500Medium",
    fontSize: 16,
  },
  countButton: {
    backgroundColor: "#1E8E4E",
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: "center",
  },
  countButtonLabel: { fontFamily: "PlusJakartaSans_600SemiBold", color: "#fff", fontSize: 14 },
  awaitingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  awaitingLabel: {
    flex: 1,
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: 13,
    lineHeight: 18,
    color: "#7A828E",
  },
  paymentNote: { fontFamily: "PlusJakartaSans_400Regular", color: "#999", fontSize: 12, marginTop: 6 },
  error: { color: "#c0392b", marginTop: 12, fontFamily: "PlusJakartaSans_400Regular" },
  primaryButton: { backgroundColor: "#111", borderRadius: 10, padding: 16, alignItems: "center", marginTop: 24 },
  primaryButtonText: { color: "#fff", fontFamily: "PlusJakartaSans_600SemiBold" },
  dangerButton: {
    borderWidth: 1,
    borderColor: "#c0392b",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 24,
  },
  dangerButtonText: { color: "#c0392b", fontFamily: "PlusJakartaSans_600SemiBold" },
});
