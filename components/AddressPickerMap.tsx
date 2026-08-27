import { forwardRef, useImperativeHandle, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import MapView, { PROVIDER_GOOGLE, type Region } from "react-native-maps";
import { brand, colors } from "@/theme/tokens";

export type LatLng = { lat: number; lng: number };

export type AddressPickerMapHandle = {
  animateTo: (point: LatLng) => void;
};

/**
 * The map half of the address picker.
 *
 * The pin is a fixed overlay at the centre of the view and the map slides
 * underneath it, rather than a draggable Marker. Dragging a marker on a phone
 * means the customer's thumb covers the exact point they are trying to place,
 * and a mis-drag silently moves the pickup address; moving the map under a
 * static crosshair keeps the target visible the whole time.
 *
 * Provider: Google on Android, the platform default on iOS. Forcing
 * PROVIDER_GOOGLE on iOS would break this screen in Expo Go, which ships
 * Apple Maps only — see components/TrackingMap.tsx, which does force it and so
 * only works in a custom dev client.
 */
export const AddressPickerMap = forwardRef<
  AddressPickerMapHandle,
  {
    initialRegion: Region;
    onSettled: (point: LatLng) => void;
  }
>(function AddressPickerMap({ initialRegion, onSettled }, ref) {
  const map = useRef<MapView | null>(null);

  useImperativeHandle(ref, () => ({
    animateTo: ({ lat, lng }) => {
      map.current?.animateToRegion(
        { latitude: lat, longitude: lng, latitudeDelta: 0.004, longitudeDelta: 0.004 },
        450,
      );
    },
  }));

  return (
    <View style={s.wrap}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
        // Fires once the gesture has stopped, so the address is resolved for
        // where the customer actually landed rather than for every frame of
        // the pan — which would be a reverse-geocode call per frame.
        onRegionChangeComplete={(region) =>
          onSettled({ lat: region.latitude, lng: region.longitude })
        }
      />

      {/* Centre crosshair. pointerEvents none so it never eats a pan. */}
      <View pointerEvents="none" style={s.pinWrap}>
        <View style={s.pinHead} />
        <View style={s.pinStem} />
        <View style={s.pinShadow} />
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  wrap: { flex: 1, overflow: "hidden" },
  pinWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  pinHead: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: brand.moonstoneInk,
    borderWidth: 3,
    borderColor: colors.textInverse,
    // Lifts the head so the stem's tip, not the circle, marks the point.
    marginBottom: 0,
  },
  pinStem: {
    width: 2,
    height: 14,
    backgroundColor: brand.moonstoneInk,
  },
  pinShadow: {
    width: 8,
    height: 3,
    borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
});
