import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { brand, colors, font, radius } from "@/theme/tokens";
import { useI18n } from "@/lib/language-context";
import { fetchOrderPhotos, type OrderPhoto } from "@/lib/order-photos";

/**
 * The garment photos on an order.
 *
 * These exist to settle "it came back damaged" arguments, and until now
 * nothing displayed them: the column was written on every order and read by
 * no screen. The courier and the admin are the readers who most need them —
 * they are the ones the dispute is about — and neither holds a storage grant,
 * so the URLs are signed by the API.
 *
 * Signed URLs expire in minutes, which makes this different from an ordinary
 * image list: a screen left open past the expiry shows broken images unless it
 * refetches. It refetches on expiry rather than lengthening the TTL, because
 * the URL is the only thing protecting a photograph taken inside a customer's
 * home.
 */
export function OrderPhotoStrip({ orderId }: { orderId: string }) {
  const { t } = useI18n();
  const [photos, setPhotos] = useState<OrderPhoto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoomed, setZoomed] = useState<string | null>(null);

  // Held in a ref, not state: the expiry drives a timer, and putting it in
  // state would re-render the strip once per refresh for no visible change.
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const { photos: next, expiresAt } = await fetchOrderPhotos(orderId);
      if (!mounted.current) return;

      setPhotos(next);
      setFailed(false);

      if (expiryTimer.current) clearTimeout(expiryTimer.current);

      // Refresh a little before the URLs actually die, so a customer looking
      // at a photo when the timer fires does not watch it blank out. Floored
      // at ten seconds so a misconfigured short TTL cannot become a loop.
      const lead = 15_000;
      const delay = Math.max(10_000, expiresAt - Date.now() - lead);
      expiryTimer.current = setTimeout(load, delay);
    } catch {
      if (!mounted.current) return;
      // A failed load leaves whatever was already on screen. The photos are
      // supporting evidence on a screen about something else; replacing the
      // order detail with an error because they would not sign is the wrong
      // trade.
      setFailed(true);
      setPhotos((current) => current ?? []);
    }
  }, [orderId]);

  useEffect(() => {
    mounted.current = true;
    load();

    return () => {
      mounted.current = false;
      if (expiryTimer.current) clearTimeout(expiryTimer.current);
    };
  }, [load]);

  if (photos === null) {
    return (
      <View style={s.card}>
        <Text style={s.title}>{t("orderPhotos")}</Text>
        <ActivityIndicator color={brand.moonstoneInk} style={s.loader} />
      </View>
    );
  }

  // An order with no photos says nothing at all. Every itemised order used to
  // require three, but bulk orders have none by design and photos became
  // optional besides — an empty "Photos" card on those is just noise.
  if (photos.length === 0) return null;

  const viewable = photos.filter((p) => p.url !== null);
  const unviewable = photos.length - viewable.length;

  return (
    <View style={s.card}>
      <Text style={s.title}>{t("orderPhotos")}</Text>

      {viewable.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.strip}
        >
          {viewable.map((photo) => (
            <Pressable
              key={photo.path}
              onPress={() => setZoomed(photo.url)}
              accessibilityRole="imagebutton"
              accessibilityLabel={t("orderPhotoOpen")}
            >
              <Image source={{ uri: photo.url! }} style={s.thumb} resizeMode="cover" />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {/* Photos taken before uploads existed are device URIs that resolve for
          nobody. Saying so is better than showing a broken frame, and better
          than hiding them — an order that recorded three photos and can show
          none is exactly the case a dispute turns on. */}
      {unviewable > 0 ? (
        <View style={s.noticeRow}>
          <Ionicons name="alert-circle-outline" size={15} color={colors.textSecondary} />
          <Text style={s.notice}>{t("orderPhotosUnavailable", { count: unviewable })}</Text>
        </View>
      ) : null}

      {failed && viewable.length === 0 ? (
        <Pressable style={s.noticeRow} onPress={load} hitSlop={8}>
          <Ionicons name="refresh" size={15} color={brand.moonstoneInk} />
          <Text style={s.retry}>{t("orderPhotosRetry")}</Text>
        </Pressable>
      ) : null}

      <Modal
        visible={zoomed !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setZoomed(null)}
      >
        <Pressable style={s.backdrop} onPress={() => setZoomed(null)}>
          {zoomed ? (
            <Image source={{ uri: zoomed }} style={s.full} resizeMode="contain" />
          ) : null}
          <View style={s.closeHint}>
            <Ionicons name="close" size={22} color={colors.textInverse} />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: brand.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: brand.border,
    padding: 16,
    gap: 10,
  },
  title: { fontFamily: font.bold, fontSize: 15, color: colors.textPrimary },
  loader: { alignSelf: "flex-start" },
  strip: { gap: 10, paddingRight: 4 },
  thumb: {
    width: 92,
    height: 92,
    borderRadius: radius.md,
    backgroundColor: brand.aliceBlue,
  },
  noticeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  notice: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  retry: { fontFamily: font.semibold, fontSize: 13, color: brand.moonstoneInk },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  full: { width: "100%", height: "80%" },
  closeHint: { position: "absolute", top: 48, right: 24 },
});
