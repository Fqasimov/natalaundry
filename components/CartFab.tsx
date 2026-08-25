import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCart } from "@/lib/state/cart";
import { colors, font } from "@/theme/tokens";

/**
 * Floating basket button.
 *
 * A customer who picks items and then wanders off — to the home tab, to their
 * profile — otherwise has no visible way back to the basket, and the draft
 * lives only in memory. This keeps the way back on screen wherever they go.
 *
 * It hides itself when the basket is empty (nothing to return to) and on the
 * checkout screens themselves (the basket is already what you are looking at,
 * and it would sit on top of the confirm button).
 */

/** Routes where a floating basket button would be redundant or in the way. */
const HIDDEN_ON = ["/checkout", "/payment", "/toplu", "/track", "/courier"];

export function CartFab() {
  const insets = useSafeAreaInsets();
  const { count } = useCart();
  const pathname = usePathname();

  if (count === 0) return null;
  if (HIDDEN_ON.some((prefix) => pathname.startsWith(prefix))) return null;

  return (
    <Pressable
      onPress={() => router.push("/checkout/summary")}
      accessibilityRole="button"
      accessibilityLabel={`${count}`}
      style={({ pressed }) => [
        styles.wrap,
        // Clear of the tab bar, which is 78pt plus the home indicator.
        { bottom: insets.bottom + 92 },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.circle}>
        <Ionicons name="cart" size={26} color={colors.textInverse} />
      </View>

      <View style={styles.badge}>
        <Text style={styles.badgeLabel} numberOfLines={1}>
          {count > 99 ? "99+" : count}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", right: 18 },
  pressed: { transform: [{ scale: 0.94 }] },
  circle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    // Separates the badge from the button beneath it on any background.
    borderWidth: 2,
    borderColor: colors.background,
  },
  badgeLabel: {
    fontFamily: font.bold,
    fontSize: 12,
    lineHeight: 15,
    color: colors.textInverse,
  },
});
