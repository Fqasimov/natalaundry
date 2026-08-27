import { StyleSheet, Text, View } from "react-native";
import { brand, colors, font, radius } from "@/theme/tokens";

export type LatLng = { lat: number; lng: number };

/**
 * Web stand-in for the native map.
 *
 * react-native-maps has no web implementation — importing it into a web bundle
 * breaks the build — so Metro picks this file up instead via the .web
 * extension. The phone app is the real target for tracking; this keeps the web
 * export (used for previews) working and still shows the live coordinates
 * rather than pretending the feature is missing.
 */
export function TrackingMap({
  courier,
  destination,
}: {
  courier: LatLng | null;
  destination: LatLng | null;
  heading?: number | null;
}) {
  const point = courier ?? destination;
  return (
    <View style={s.wrap}>
      <Text style={s.title}>Map</Text>
      {point ? (
        <Text style={s.coords}>
          {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
        </Text>
      ) : null}
      <Text style={s.note}>Live map renders in the iOS / Android build.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    height: 260,
    borderRadius: radius.lg,
    backgroundColor: brand.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  title: { fontFamily: font.bold, fontSize: 15, color: brand.onSoftMuted },
  coords: { fontFamily: font.medium, fontSize: 13, color: colors.textPrimary },
  note: { fontFamily: font.regular, fontSize: 12, color: brand.onSoftMuted },
});
