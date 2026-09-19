import { Image, View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

/**
 * The Nata Laundry mark — the blue droplet disc, filling its container.
 *
 * There used to be a translucent white ring behind it, on the reasoning that
 * the mark's blue was close to the hero gradient and needed separating. Two
 * things were wrong with that. The hero is midnight green, not blue, so the
 * mark already separates; and the ring combined with a pale halo baked into
 * the artwork read as a white smear around the logo on every auth screen.
 *
 * The halo is gone too — scripts/clean-logo.js trims it when re-cutting the
 * circular mask, because it was also bleeding into the app icon. If the logo
 * artwork is ever replaced, run that script before anything else.
 */
export function AppLogo({
  size = 84,
  style,
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[styles.wrap, { width: size, height: size, borderRadius: size / 2 }, style]}
    >
      <Image
        source={require("@/assets/images/nata-logo.png")}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel="Nata Laundry"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
});
