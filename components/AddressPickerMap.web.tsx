import { forwardRef, useImperativeHandle } from "react";
import { StyleSheet, Text, View } from "react-native";
import { brand, colors, font } from "@/theme/tokens";

export type LatLng = { lat: number; lng: number };

export type AddressPickerMapHandle = {
  animateTo: (point: LatLng) => void;
};

/**
 * Web stand-in, picked up by Metro via the .web extension.
 *
 * react-native-maps has no web implementation and importing it into a web
 * bundle breaks the build — the same reason components/TrackingMap.web.tsx
 * exists. Address picking is a phone flow; this only keeps `expo export
 * --platform web` working.
 */
export const AddressPickerMap = forwardRef<
  AddressPickerMapHandle,
  {
    initialRegion: { latitude: number; longitude: number };
    onSettled: (point: LatLng) => void;
  }
>(function AddressPickerMap({ initialRegion }, ref) {
  useImperativeHandle(ref, () => ({ animateTo: () => undefined }));

  return (
    <View style={s.wrap}>
      <Text style={s.title}>Map</Text>
      <Text style={s.coords}>
        {initialRegion.latitude.toFixed(5)}, {initialRegion.longitude.toFixed(5)}
      </Text>
      <Text style={s.note}>Address picking runs in the iOS / Android build.</Text>
    </View>
  );
});

const s = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: brand.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  title: { fontFamily: font.bold, fontSize: 15, color: brand.onSoftMuted },
  coords: { fontFamily: font.medium, fontSize: 13, color: colors.textPrimary },
  note: { fontFamily: font.regular, fontSize: 12, color: brand.onSoftMuted },
});
