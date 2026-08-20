import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Pressable, RefreshControl } from "react-native";
import { router } from "expo-router";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/profile";
import { fetchAvailableOrdersForCourier, fetchMyCourierOrders, fetchMyOrders } from "@/lib/orders";
import type { Order } from "@/types/database";

type CourierTab = "available" | "mine";

export default function OrdersScreen() {
  const { session } = useAuth();
  const { profile } = useProfile();
  const isCourier = profile?.role === "courier";

  const [courierTab, setCourierTab] = useState<CourierTab>("available");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      let data: Order[];
      if (isCourier && session?.user.id) {
        data =
          courierTab === "available"
            ? await fetchAvailableOrdersForCourier()
            : await fetchMyCourierOrders(session.user.id);
      } else {
        data = await fetchMyOrders();
      }
      setOrders(data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [isCourier, courierTab, session?.user.id]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loadError) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{loadError}</Text>
      </View>
    );
  }

  if (!orders) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, paddingTop: 60 }}>
      <Text style={styles.header}>{isCourier ? "Jobs" : "Your orders"}</Text>

      {isCourier && (
        <View style={styles.segmented}>
          <Pressable
            style={[styles.segment, courierTab === "available" && styles.segmentActive]}
            onPress={() => setCourierTab("available")}
          >
            <Text style={[styles.segmentText, courierTab === "available" && styles.segmentTextActive]}>
              Available
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segment, courierTab === "mine" && styles.segmentActive]}
            onPress={() => setCourierTab("mine")}
          >
            <Text style={[styles.segmentText, courierTab === "mine" && styles.segmentTextActive]}>Mine</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        contentContainerStyle={styles.list}
        data={orders}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Text style={styles.empty}>No orders yet</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/order/${item.id}`)}>
            <View>
              <Text style={styles.rowTitle}>Order #{item.order_no}</Text>
              <Text style={styles.rowSubtitle}>{item.address ?? "No address"}</Text>
            </View>
            <StatusBadge status={item.status} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { fontFamily: "Outfit_700Bold", fontSize: 22, paddingHorizontal: 16, marginBottom: 12 },
  segmented: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: "#f2f2f2",
    borderRadius: 10,
    padding: 3,
  },
  segment: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  segmentActive: { backgroundColor: "#fff" },
  segmentText: { fontFamily: "Outfit_500Medium", color: "#666" },
  segmentTextActive: { color: "#111" },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  empty: { fontFamily: "Outfit_400Regular", color: "#666", textAlign: "center", marginTop: 40 },
  error: { fontFamily: "Outfit_400Regular", color: "#c0392b" },
  row: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowTitle: { fontFamily: "Outfit_500Medium" },
  rowSubtitle: { fontFamily: "Outfit_400Regular", color: "#666", fontSize: 12, marginTop: 2 },
});
