import { View, Text, StyleSheet } from "react-native";
import type { OrderStatus } from "@/types/database";

const LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  collecting: "Collecting",
  cleaning: "Cleaning",
  delivering: "Delivering",
  completed: "Completed",
  cancelled: "Cancelled",
};

const COLORS: Record<OrderStatus, string> = {
  pending: "#b7791f",
  collecting: "#2563eb",
  cleaning: "#7c3aed",
  delivering: "#0891b2",
  completed: "#15803d",
  cancelled: "#c0392b",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const color = COLORS[status] ?? "#666";
  return (
    <View style={[styles.badge, { backgroundColor: `${color}1a`, borderColor: color }]}>
      <Text style={[styles.text, { color }]}>{LABELS[status] ?? status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  text: { fontFamily: "Outfit_600SemiBold", fontSize: 12 },
});
