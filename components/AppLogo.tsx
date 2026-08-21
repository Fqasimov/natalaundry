import { Image, View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

/**
 * The Nata Laundry mark — the blue droplet icon, supplied as artwork and
 * masked to a circle (the source PDF's white page is already stripped, so
 * the corners are transparent).
 *
 * It sits on the blue hero gradient on most screens, and the mark's own blue
 * is close to that gradient, so a translucent white ring is drawn behind it
 * by default to keep the edge readable. Pass `ring={false}` on a light
 * background, where the mark separates on its own.
 */
export function AppLogo({
  size = 84,
  ring = true,
  style,
}: {
  size?: number;
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const pad = ring ? Math.round(size * 0.06) : 0;
  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          padding: pad,
          backgroundColor: ring ? "rgba(255,255,255,0.22)" : "transparent",
        },
        style,
      ]}
    >
      <Image
        source={require("@/assets/images/nata-logo.png")}
        style={{
          width: size - pad * 2,
          height: size - pad * 2,
          borderRadius: (size - pad * 2) / 2,
        }}
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
