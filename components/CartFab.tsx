import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCart } from "@/lib/state/cart";
import { brand, colors, font } from "@/theme/tokens";

/**
 * Floating basket button — home screen only.
 *
 * It is a fixture of the home screen rather than a thing that appears when the
 * basket fills: it is always there, so its position is learnable and it never
 * shifts the layout by materialising mid-scroll. An empty basket still opens
 * the summary, which is where "your basket is empty" belongs.
 *
 * Every other screen is excluded, not just the ones where it would overlap.
 * The catalogue and checkout already carry their own basket affordances (the
 * running total bar, the confirm button), and a second floating one competes
 * with them.
 */

/** The home tab. expo-router strips the "(tabs)" group, so index is "/". */
const HOME = "/";

export function CartFab() {
  const insets = useSafeAreaInsets();
  const { count } = useCart();
  const pathname = usePathname();

  if (pathname !== HOME) return null;

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

      {/* The badge is the one part that is still conditional — a "0" on a
          permanent button reads as a broken counter rather than an empty
          basket. */}
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeLabel} numberOfLines={1}>
            {count > 99 ? "99+" : count}
          </Text>
        </View>
      ) : null}
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
    // Now that it only ever sits on the restyled home screen, it takes that
    // screen's palette rather than the 1.0.2 blue.
    backgroundColor: brand.midnight,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: brand.midnight,
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
    // Separates the badge from the button beneath it. Matches the home
    // screen's own surface, which is the only place this now renders.
    borderWidth: 2,
    borderColor: brand.background,
  },
  badgeLabel: {
    fontFamily: font.bold,
    fontSize: 12,
    lineHeight: 15,
    color: colors.textInverse,
  },
});
