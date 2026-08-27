import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AddressPickerMap,
  type AddressPickerMapHandle,
  type LatLng,
} from "@/components/AddressPickerMap";
import { BigButton, ScreenHeader } from "@/components/ui";
import { useCart } from "@/lib/state/cart";
import { useI18n } from "@/lib/language-context";
import { brand, colors, font, radius } from "@/theme/tokens";

/** Baku city centre — where the map opens before we know anything better. */
const BAKU = { latitude: 40.3776, longitude: 49.892, latitudeDelta: 0.05, longitudeDelta: 0.05 };

/**
 * Pick the pickup address on a map.
 *
 * Replaces the free-text address field. A typed address is only as good as the
 * customer's spelling and gives the courier nothing to navigate to; a point on
 * a map gives real coordinates, which is what `orders.address_lat/lng` and the
 * courier's tracking screen actually want.
 *
 * The human-readable line is still stored alongside the coordinates: the
 * courier needs a flat number and a street name, not just a pin.
 */
export default function AddressPickerScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { draft, patchDraft } = useCart();
  const map = useRef<AddressPickerMapHandle>(null);

  // Re-open where they last chose, so revisiting the screen isn't a reset.
  const [point, setPoint] = useState<LatLng>(
    draft.addressLat != null && draft.addressLng != null
      ? { lat: draft.addressLat, lng: draft.addressLng }
      : { lat: BAKU.latitude, lng: BAKU.longitude },
  );
  const [label, setLabel] = useState(draft.address);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);

  // Guards against a slow reverse-geocode landing after a newer one and
  // overwriting the right address with a stale one.
  const requestId = useRef(0);

  const resolve = useCallback(async (next: LatLng) => {
    const id = ++requestId.current;
    setResolving(true);
    try {
      // The OS geocoder, not the Google Geocoding API: it needs no key, no
      // per-call billing, and is already permitted by the location grant.
      const [place] = await Location.reverseGeocodeAsync({
        latitude: next.lat,
        longitude: next.lng,
      });
      if (id !== requestId.current) return;

      if (place) {
        const line = [
          place.street,
          place.streetNumber,
          place.district ?? place.subregion,
          place.city,
        ]
          .filter(Boolean)
          .join(", ");
        setLabel(line || `${next.lat.toFixed(5)}, ${next.lng.toFixed(5)}`);
      }
    } catch {
      // Geocoding is a convenience. The coordinates are the real payload, so
      // a failure falls back to showing them rather than blocking the pick.
      if (id === requestId.current) {
        setLabel(`${next.lat.toFixed(5)}, ${next.lng.toFixed(5)}`);
      }
    } finally {
      if (id === requestId.current) setResolving(false);
    }
  }, []);

  const useMyLocation = useCallback(async () => {
    setLocating(true);
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return;

      const fix = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const next = { lat: fix.coords.latitude, lng: fix.coords.longitude };
      // Moving the map fires onRegionChangeComplete, which resolves the
      // address — so this does not geocode here as well.
      map.current?.animateTo(next);
      setPoint(next);
    } catch {
      // Location can fail for reasons the customer can't act on (no fix
      // indoors, services off). The map still works by hand.
    } finally {
      setLocating(false);
    }
  }, []);

  // Centre on the customer the first time, but only when they have not
  // already chosen a point — otherwise this would throw away their choice.
  useEffect(() => {
    if (draft.addressLat == null) void useMyLocation();
    else void resolve(point);
    // Intentionally on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = () => {
    patchDraft({ address: label, addressLat: point.lat, addressLng: point.lng });
    router.back();
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScreenHeader title={t("addressPickTitle")} backFallback="/checkout/summary" />

      <View style={s.mapWrap}>
        <AddressPickerMap
          ref={map}
          initialRegion={{
            latitude: point.lat,
            longitude: point.lng,
            latitudeDelta: draft.addressLat != null ? 0.004 : BAKU.latitudeDelta,
            longitudeDelta: draft.addressLng != null ? 0.004 : BAKU.longitudeDelta,
          }}
          onSettled={(next) => {
            setPoint(next);
            void resolve(next);
          }}
        />

        <Pressable style={s.locateBtn} onPress={useMyLocation} disabled={locating}>
          {locating ? (
            <ActivityIndicator size="small" color={brand.moonstoneInk} />
          ) : (
            <Ionicons name="locate" size={20} color={brand.moonstoneInk} />
          )}
        </Pressable>
      </View>

      <View style={[s.sheet, { paddingBottom: insets.bottom + 14 }]}>
        <Text style={s.sheetLabel}>{t("addressPickSelected")}</Text>

        <View style={s.addressRow}>
          <Ionicons name="location" size={18} color={brand.moonstoneInk} />
          <Text style={s.address} numberOfLines={2}>
            {resolving && !label ? t("addressPickResolving") : label || t("addressPickHint")}
          </Text>
          {resolving && label ? <ActivityIndicator size="small" color={brand.onSoftMuted} /> : null}
        </View>

        <BigButton label={t("addressPickConfirm")} onPress={confirm} disabled={!label} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.background },
  mapWrap: { flex: 1 },
  locateBtn: {
    position: "absolute",
    right: 16,
    bottom: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: brand.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: brand.midnight,
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  sheet: {
    backgroundColor: brand.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: brand.divider,
  },
  sheetLabel: {
    fontFamily: font.semibold,
    fontSize: 12.5,
    letterSpacing: 0.3,
    color: brand.onSoftMuted,
    textTransform: "uppercase",
  },
  addressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  address: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textPrimary,
  },
});
