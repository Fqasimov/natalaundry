import { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import type { WalletTransaction } from "@/types/database";

// wallet_transactions columns are confirmed via the schema dump — this
// screen is on solid ground, unlike the booking/order screens.
export default function WalletScreen() {
  const { session } = useAuth();
  const [transactions, setTransactions] = useState<WalletTransaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user.id) return;
    supabase
      .from("wallet_transactions")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
          return;
        }
        setTransactions((data as WalletTransaction[]) ?? []);
      });
  }, [session?.user.id]);

  const balance = (transactions ?? []).reduce((sum, t) => sum + Number(t.amount), 0);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!transactions) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={transactions}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Wallet balance</Text>
          <Text style={styles.balanceValue}>{balance.toFixed(2)}</Text>
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>No transactions yet</Text>}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View>
            <Text style={styles.rowKind}>{item.kind}</Text>
            {item.note ? <Text style={styles.rowNote}>{item.note}</Text> : null}
          </View>
          <Text style={[styles.rowAmount, Number(item.amount) < 0 && styles.rowAmountNegative]}>
            {Number(item.amount) > 0 ? "+" : ""}
            {Number(item.amount).toFixed(2)}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, paddingTop: 60 },
  balanceCard: { backgroundColor: "#111", borderRadius: 16, padding: 20, marginBottom: 20 },
  balanceLabel: { fontFamily: "Outfit_400Regular", color: "#ccc" },
  balanceValue: { fontFamily: "Outfit_700Bold", color: "#fff", fontSize: 32, marginTop: 4 },
  empty: { fontFamily: "Outfit_400Regular", color: "#666", textAlign: "center", marginTop: 40 },
  error: { fontFamily: "Outfit_400Regular", color: "#c0392b" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  rowKind: { fontFamily: "Outfit_500Medium", textTransform: "capitalize" },
  rowNote: { fontFamily: "Outfit_400Regular", color: "#666", fontSize: 12, marginTop: 2 },
  rowAmount: { fontFamily: "Outfit_600SemiBold", color: "#15803d" },
  rowAmountNegative: { color: "#c0392b" },
});
