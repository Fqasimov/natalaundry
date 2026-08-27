import { useEffect, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { brand, colors, radius } from "@/theme/tokens";

export type LatLng = { lat: number; lng: number };

/**
 * Native map with the courier and the destination on it.
 *
 * The courier marker is animated toward each new fix rather than jumped: fixes
 * arrive every few seconds, and teleporting the marker reads as a glitch.
 * `animateMarkerToCoordinate` is Android-only, so iOS gets a region animation
 * instead — both end up smooth, neither needs a paid tracking SDK.
 *
 * Provider: Google on Android, the platform default (Apple Maps) on iOS.
 * Forcing PROVIDER_GOOGLE on iOS makes this screen unusable in Expo Go, which
 * ships Apple Maps only, so tracking could not be tested without a custom dev
 * client. Nothing here depends on Google specifically — the courier position
 * comes from our own courier_locations table, not from a Google product.
 */
export function TrackingMap({
  courier,
  destination,
  heading,
}: {
  courier: LatLng | null;
  destination: LatLng | null;
  heading?: number | null;
}) {
  const map = useRef<MapView | null>(null);
  const focus = courier ?? destination;

  useEffect(() => {
    if (!map.current || !courier) return;
    map.current.animateCamera(
      { center: { latitude: courier.lat, longitude: courier.lng } },
      { duration: 900 }
    );
  }, [courier?.lat, courier?.lng]);

  if (!focus) return <View style={s.placeholder} />;

  return (
    <View style={s.wrap}>
      <MapView
        ref={map}
        provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: focus.lat,
          longitude: focus.lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        showsUserLocation={false}
        toolbarEnabled={false}
      >
        {destination ? (
          <Marker
            coordinate={{ latitude: destination.lat, longitude: destination.lng }}
            pinColor={colors.accent}
          />
        ) : null}
        {courier ? (
          <Marker
            coordinate={{ latitude: courier.lat, longitude: courier.lng }}
            rotation={heading ?? 0}
            flat
            pinColor={brand.moonstoneInk}
          />
        ) : null}
      </MapView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    height: 260,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: brand.surfaceAlt,
  },
  placeholder: {
    height: 260,
    borderRadius: radius.lg,
    backgroundColor: brand.surfaceAlt,
  },
});
