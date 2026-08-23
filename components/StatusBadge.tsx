import { View, Text, StyleSheet } from "react-native";
import { colors, font, radius } from "@/theme/tokens";
import { useI18n } from "@/lib/language-context";
import type { OrderStatus } from "@/types/database";

// The coarse six-value `orders.status`. Copy is translated like everything
// else the customer reads; the nine lifecycle states have their own labels.
const LABEL_KEY: Record<OrderStatus, string> = {
  pending: "statusPending",
  collecting: "statusCollecting",
  cleaning: "statusCleaning",
  delivering: "statusDelivering",
  completed: "statusCompleted",
  cancelled: "statusCancelled",
};

const TINT: Record<OrderStatus, string> = {
  pending: colors.amber,
  collecting: colors.primary,
  cleaning: colors.primary,
  delivering: colors.primary,
  completed: colors.success,
  cancelled: colors.danger,
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useI18n();
  const tint = TINT[status] ?? colors.textSecondary;

  return (
    <View style={[styles.badge, { backgroundColor: `${tint}1A` }]}>
      <Text style={[styles.text, { color: tint }]}>
        {t((LABEL_KEY[status] ?? "statusPending") as never)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  text: { fontFamily: font.semibold, fontSize: 12 },
});
