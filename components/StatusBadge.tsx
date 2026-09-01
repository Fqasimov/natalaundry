import { View, Text, StyleSheet } from "react-native";
import { brand, colors, font, radius } from "@/theme/tokens";
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

// The badge only ever appears in the orders section, so it follows the coastal
// palette: Timberwolf ink for "waiting on us", Moonstone while the order is
// moving (darkened: the badge paints its tint at 10% behind that same tint,
// and Moonstone at full strength only reaches 2.6:1 on it), and Midnight
// Green for the last leg. `completed` and `cancelled` keep
// green and red — those two read as outcomes, not as brand colour, and losing
// the red on a cancelled order would cost real information.
const TINT: Record<OrderStatus, string> = {
  pending: brand.timberwolfInk,
  collecting: brand.moonstoneInk,
  cleaning: brand.moonstoneInk,
  delivering: brand.midnight,
  completed: colors.success,
  cancelled: colors.danger,
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useI18n();
  const tint = TINT[status] ?? colors.textSecondary;

  return (
    <View style={[styles.badge, { backgroundColor: `${tint}1A` }]}>
      <Text style={[styles.text, { color: tint }]} numberOfLines={1}>
        {t((LABEL_KEY[status] ?? "statusPending") as never)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // The badge always sits at the end of a row beside an order number or a
  // status line. It holds its own width so the text beside it is what wraps,
  // rather than the badge being squeezed until its label leaves the pill.
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
    flexShrink: 0,
  },
  text: { fontFamily: font.semibold, fontSize: 12 },
});
