import { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { supabase } from "@/lib/supabase";
import type { OrderStatus } from "@/types/database";

// `orders` table + status enum confirmed via RLS policy dump. Column list
// beyond id/status/created_at is still a guess pending the full
// information_schema dump.
type Order = {
  id: string;
  status: OrderStatus;
  created_at: string;
};

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("orders")
      .select("id, status, created_at")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setLoadError(error.message);
          return;
        }
        setOrders(data ?? []);
      });
  }, []);

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
    <FlatList
      contentContainerStyle={styles.list}
      data={orders}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={<Text style={styles.empty}>No orders yet</Text>}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.rowTitle}>Order {item.id.slice(0, 8)}</Text>
          <Text style={styles.rowStatus}>{item.status}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, paddingTop: 80 },
  empty: { fontFamily: "Outfit_400Regular", color: "#666", textAlign: "center", marginTop: 40 },
  error: { fontFamily: "Outfit_400Regular", color: "#c0392b" },
  row: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  rowTitle: { fontFamily: "Outfit_500Medium" },
  rowStatus: { fontFamily: "Outfit_400Regular", color: "#666" },
});
