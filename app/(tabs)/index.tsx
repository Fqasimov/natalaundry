import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/profile";
import { fetchAvailableOrdersForCourier, fetchMyOrders } from "@/lib/orders";
import type { Order } from "@/types/database";

export default function HomeScreen() {
  const { session } = useAuth();
  const { profile, isLoading: profileLoading } = useProfile();
  const [activeOrder, setActiveOrder] = useState<Order | null | undefined>(undefined);
  const [availableCount, setAvailableCount] = useState<number | null>(null);

  const isCourier = profile?.role === "courier";

  useEffect(() => {
    if (profileLoading) return;
    if (isCourier) {
      fetchAvailableOrdersForCourier().then((orders) => setAvailableCount(orders.length));
    } else {
      fetchMyOrders().then((orders) => {
        const active = orders.find((o) => !["completed", "cancelled"].includes(o.status));
        setActiveOrder(active ?? null);
      });
    }
  }, [isCourier, profileLoading]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.greeting}>Hi 👋</Text>
          <Text style={styles.email}>{session?.user.email}</Text>
        </View>
        <Pressable onPress={() => router.push("/notifications")} hitSlop={12}>
          <Ionicons name="notifications-outline" size={24} color="#111" />
        </Pressable>
      </View>

      {profileLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : isCourier ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Available jobs</Text>
          <Text style={styles.cardBig}>{availableCount ?? "—"}</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.push("/(tabs)/orders")}>
            <Text style={styles.primaryButtonText}>View jobs</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {activeOrder === undefined ? (
            <ActivityIndicator style={{ marginTop: 40 }} />
          ) : activeOrder ? (
            <Pressable style={styles.card} onPress={() => router.push(`/order/${activeOrder.id}`)}>
              <Text style={styles.cardTitle}>Active order</Text>
              <View style={{ marginTop: 8, marginBottom: 12 }}>
                <StatusBadge status={activeOrder.status} />
              </View>
              <Text style={styles.cardSubtitle}>{activeOrder.address ?? "No address"}</Text>
            </Pressable>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>No active orders</Text>
              <Text style={styles.cardSubtitle}>Book a pickup and we&apos;ll take it from here.</Text>
            </View>
          )}

          <Pressable style={styles.primaryButton} onPress={() => router.push("/book")}>
            <Text style={styles.primaryButtonText}>Book a pickup</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 70, backgroundColor: "#fff" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  greeting: { fontFamily: "Outfit_700Bold", fontSize: 24 },
  email: { fontFamily: "Outfit_400Regular", color: "#666", marginTop: 2 },
  card: {
    backgroundColor: "#f7f7f7",
    borderRadius: 16,
    padding: 20,
    marginTop: 28,
  },
  cardTitle: { fontFamily: "Outfit_600SemiBold", fontSize: 16 },
  cardSubtitle: { fontFamily: "Outfit_400Regular", color: "#666", marginTop: 6 },
  cardBig: { fontFamily: "Outfit_700Bold", fontSize: 40, marginTop: 8 },
  primaryButton: { backgroundColor: "#111", borderRadius: 10, padding: 16, alignItems: "center", marginTop: 20 },
  primaryButtonText: { color: "#fff", fontFamily: "Outfit_600SemiBold" },
});
