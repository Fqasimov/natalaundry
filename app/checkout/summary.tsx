import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  Image,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { brand, colors, font, money, radius } from "@/theme/tokens";
import { useI18n } from "@/lib/language-context";
import { LinearGradient } from "expo-linear-gradient";
import { useCart } from "@/lib/state/cart";
import { fetchGiftBoxes, type ActiveReward } from "@/lib/gift-boxes";
import { REWARD_PRESENTATION } from "@/lib/rewards";
import { useRewardCopy } from "@/lib/rewards-i18n";
import { useAuth } from "@/lib/auth-context";
import { OUTSIDE_CITY_FEE, RECOMMENDED_PHOTOS } from "@/lib/pricing";
import { createOrder } from "@/lib/orders";
import {
  fetchPaymentOptions,
  payForOrder,
  waitForSettlement,
  walletForPlatform,
  type PaymentMethod,
} from "@/lib/payments";
import { PaymentMethodPicker } from "@/components/PaymentMethodPicker";
import { removeOrderPhoto, uploadOrderPhoto } from "@/lib/uploads";
import { BigButton, Pill, ScreenHeader, Stepper } from "@/components/ui";

// "Sifariş xülasəsi" — the final step. Note the hard gate the shipped app
// enforces: at least three garment photos before the order can be submitted.
export default function SummaryScreen() {
  const insets = useSafeAreaInsets();
  const { t, lang } = useI18n();
  const { session } = useAuth();
  const { lines, draft, patchDraft, setQty, breakdown, reset } = useCart();
  const [submitting, setSubmitting] = useState(false);
  const [promoDraft, setPromoDraft] = useState(draft.promoCode);
  const [rewards, setRewards] = useState<ActiveReward[]>([]);
  const rewardCopy = useRewardCopy();

  // Card is the default because it is the only method that is certain to be
  // offered — wallets depend on the bank terminal, and the list is narrowed
  // to whatever the server says is actually available.
  const [payMethod, setPayMethod] = useState<PaymentMethod>("card");
  const [payMethods, setPayMethods] = useState<PaymentMethod[]>(["card", "cash"]);
  const [payNotice, setPayNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPaymentOptions()
      .then((options) => {
        if (cancelled) return;
        // Only this device's own wallet is ever shown: an Apple Pay button on
        // Android is a dead end.
        const wallet = walletForPlatform();
        setPayMethods(
          options.methods.filter(
            (m) => m === "card" || m === "cash" || m === wallet,
          ),
        );
      })
      // Falling back to card + cash is safe: both work without any
      // terminal-specific configuration.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // A failure here is not worth blocking checkout over — the customer just
    // does not see the gift picker.
    fetchGiftBoxes()
      .then((state) => setRewards(state.active_rewards))
      .catch(() => setRewards([]));
  }, []);

  const [error, setError] = useState<string | null>(null);

  // Photos are encouraged, not required — this only drives the counter's
  // colour and the hint, never whether the order can be submitted.
  const hasAllPhotos = draft.photos.length >= RECOMMENDED_PHOTOS;

  // An address needs a pin, not just a label: the courier navigates to the
  // coordinates. This is the one thing that now gates the confirm button.
  const hasAddress =
    draft.address.length > 0 && draft.addressLat != null && draft.addressLng != null;

  // Photos are uploaded as they are taken, not when the order is submitted.
  //
  // Until this existed the picker's `file://` URI went straight onto the
  // order, so every photo in production points at a path on the phone that
  // took it and is invisible to the courier and the admin. `previews` keeps
  // the local URI for the thumbnail strip, keyed by the storage path that is
  // actually recorded — the customer sees their own photo immediately without
  // waiting for a round trip back out of the bucket.
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  const addPhoto = async (source: "camera" | "library") => {
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });

    const asset = !result.canceled ? result.assets?.[0] : null;
    if (!asset) return;

    setUploading(true);
    setError(null);
    try {
      const path = await uploadOrderPhoto({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
      });
      setPreviews((current) => ({ ...current, [path]: asset.uri }));
      patchDraft({ photos: [...draft.photos, path] });
    } catch (e) {
      // Photos are optional, so a failed upload must not block checkout —
      // say so and let them carry on or try again.
      setError(e instanceof Error ? e.message : t("photoUploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  const dropPhoto = (index: number) => {
    const path = draft.photos[index];
    patchDraft({ photos: draft.photos.filter((_, i) => i !== index) });
    setPreviews((current) => {
      const next = { ...current };
      delete next[path];
      return next;
    });
    // The object is only a draft until the order is filed, so removing it is
    // an ordinary edit rather than destroying evidence.
    void removeOrderPhoto(path);
  };

  const applyPromo = () => {
    // Promo validation belongs to the API — this only records the entered
    // code so the server can price it. No client-side discount is invented.
    patchDraft({ promoCode: promoDraft.trim().toUpperCase() });
  };

  const submit = async () => {
    if (!session?.user.id) return;
    setSubmitting(true);
    setError(null);
    setPayNotice(null);
    try {
      // No money is sent: the server prices the basket itself, so the
      // breakdown above is only what the customer was shown.
      const order = await createOrder({
        lines,
        tier: draft.tier,
        collectionTime: `${draft.pickupDay}, ${draft.pickupSlot}`,
        deliveryTime: `${draft.deliveryDay}, ${draft.deliverySlot}`,
        address: draft.address,
        addressLat: draft.addressLat,
        addressLng: draft.addressLng,
        notes: draft.courierNote || null,
        isOutsideCity: draft.isOutsideCity,
        photos: draft.photos,
        promoCode: draft.promoCode || null,
        rewardId: draft.rewardId,
        paymentMethod: payMethod,
      });

      // The order exists from here on. Payment is a separate step against it,
      // so a card that declines leaves a real, unpaid order the customer can
      // retry from — losing the basket over a declined card would be worse
      // than showing them an order that still needs paying.
      try {
        const state = await payForOrder(order.id, payMethod, lang);
        const settled =
          state.payment_status === "pending"
            ? await waitForSettlement(order.id)
            : state;

        if (settled.payment_status !== "paid" && payMethod !== "cash") {
          // Not an error — the order is placed. Say what happened and let the
          // order screen carry the retry.
          setPayNotice(
            settled.payment_status === "pending" || settled.stale
              ? t("payPendingNotice")
              : t("payOrderPlacedUnpaid"),
          );
        }
      } catch {
        // The order is already created; a payment failure must not read as an
        // order failure. The order screen shows the real payment state.
        setPayNotice(t("payOrderPlacedUnpaid"));
      }

      reset();
      router.replace(`/order/${order.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenHeader title={t("orderSummary")} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.section}>{t("items")}</Text>
        <View style={styles.card}>
          {lines.map((line, index) => (
            <View key={`${line.serviceId}:${line.itemId}`} style={[styles.itemRow, index > 0 && styles.divided]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{line.name}</Text>
                <Text style={styles.itemUnit}>{money(line.price)}</Text>
              </View>
              <Stepper
                tone="brand"
                value={line.quantity}
                onChange={(next) => setQty(line.serviceId, line.itemId, next)}
              />
              <Text style={styles.lineTotal}>{money(line.price * line.quantity)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.promoRow}>
          <TextInput
            style={styles.promoInput}
            placeholder={t("promoPlaceholder")}
            placeholderTextColor={brand.onSoftMuted}
            autoCapitalize="characters"
            value={promoDraft}
            onChangeText={setPromoDraft}
          />
          <Pressable style={styles.promoButton} onPress={applyPromo}>
            <Text style={styles.promoButtonLabel}>{t("apply")}</Text>
          </Pressable>
        </View>

        {/* Gift box prizes the customer has won and not yet spent. The
            discount itself is priced by the server — picking one here only
            names it on the order. */}
        {rewards.length > 0 ? (
          <>
            <Text style={styles.section}>{t("rewardChoose")}</Text>
            <View style={styles.rewardList}>
              {rewards.map((reward) => {
                const look = REWARD_PRESENTATION[reward.kind];
                const text = rewardCopy.describe(reward.kind, reward.value, reward);
                const chosen = draft.rewardId === reward.id;
                return (
                  <Pressable
                    key={reward.id}
                    style={[styles.rewardRow, chosen && styles.rewardRowChosen]}
                    onPress={() =>
                      patchDraft({ rewardId: chosen ? null : reward.id })
                    }
                  >
                    <LinearGradient colors={look.gradient} style={styles.rewardIcon}>
                      <Ionicons name={look.icon} size={17} color={colors.textInverse} />
                    </LinearGradient>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rewardTitle}>{text.title}</Text>
                      <Text style={styles.rewardMeta}>
                        {t("rewardExpiresIn", { days: reward.days_left })}
                      </Text>
                    </View>
                    <Text
                      style={[styles.rewardAction, chosen && styles.rewardActionOn]}
                      numberOfLines={1}
                    >
                      {chosen ? t("rewardApplied") : t("rewardApply")}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        <Text style={styles.section}>{t("deliveryAddress")}</Text>
        {/* Picked on a map rather than typed: a free-text address gives the
            courier nothing to navigate to, and orders.address_lat/lng exist
            precisely so it doesn't have to. */}
        <Pressable
          style={styles.addressPick}
          onPress={() => router.push("/checkout/address")}
        >
          <Ionicons
            name={hasAddress ? "location" : "location-outline"}
            size={20}
            color={hasAddress ? brand.moonstoneInk : brand.onSoftMuted}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={[styles.addressText, !hasAddress && styles.addressPlaceholder]}
              numberOfLines={2}
            >
              {hasAddress ? draft.address : t("addressPickCta")}
            </Text>
            {hasAddress ? (
              <Text style={styles.addressChange}>{t("addressPickChange")}</Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={brand.onSoftMuted} />
        </Pressable>

        <View style={styles.outsideRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.outsideTitle}>{t("outsideCity")}</Text>
            <Text style={styles.outsideNote}>
              {t("outsideCityNote", { fee: money(OUTSIDE_CITY_FEE) })}
            </Text>
          </View>
          <Switch
            value={draft.isOutsideCity}
            onValueChange={(isOutsideCity) => patchDraft({ isOutsideCity })}
            trackColor={{ true: brand.moonstoneInk, false: brand.timberwolf }}
          />
        </View>

        <View style={styles.photoCard}>
          <View style={styles.photoHeader}>
            <Ionicons name="camera" size={22} color={brand.moonstoneInk} />
            <Text style={styles.photoTitle}>{t("photosTitle")}</Text>
            <Pill
              label={`${draft.photos.length}/${RECOMMENDED_PHOTOS}`}
              // Muted, not red: falling short is fine now, so it should not
              // look like an error the customer has to clear.
              tone={hasAllPhotos ? "success" : "muted"}
            />
          </View>
          <Text style={styles.photoHint}>{t("photosHint")}</Text>

          {draft.photos.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbRow}>
              {draft.photos.map((path, index) => (
                <View key={path} style={styles.thumbWrap}>
                  {/* The stored value is a private storage path, so the
                      thumbnail comes from the local copy taken moments ago
                      rather than a signed round trip. */}
                  {previews[path] ? (
                    <Image source={{ uri: previews[path] }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbPlaceholder]}>
                      <Ionicons name="image-outline" size={22} color={brand.onSoftMuted} />
                    </View>
                  )}
                  <Pressable style={styles.thumbRemove} onPress={() => dropPhoto(index)}>
                    <Ionicons name="close" size={12} color={colors.textInverse} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}

          <View style={styles.photoButtons}>
            <Pressable
              style={[styles.photoTile, uploading && styles.photoTileBusy]}
              disabled={uploading}
              onPress={() => addPhoto("camera")}
            >
              <Ionicons name="camera-outline" size={24} color={brand.moonstoneInk} />
              <Text style={styles.photoTileLabel}>{t("takePhoto")}</Text>
            </Pressable>
            <Pressable
              style={[styles.photoTile, uploading && styles.photoTileBusy]}
              disabled={uploading}
              onPress={() => addPhoto("library")}
            >
              <Ionicons name="images-outline" size={24} color={brand.moonstoneInk} />
              <Text style={styles.photoTileLabel}>{t("pickFromGallery")}</Text>
            </Pressable>
          </View>

          {uploading ? (
            <View style={styles.photoSuggestion}>
              <ActivityIndicator size="small" color={brand.moonstoneInk} />
              <Text style={styles.photoSuggestionLabel}>{t("photoUploading")}</Text>
            </View>
          ) : null}

          {!hasAllPhotos ? (
            <View style={styles.photoSuggestion}>
              <Ionicons name="information-circle" size={16} color={brand.onSoftMuted} />
              <Text style={styles.photoSuggestionLabel}>{t("photosOptional")}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.section}>{t("payMethodTitle")}</Text>
        <PaymentMethodPicker
          methods={payMethods}
          value={payMethod}
          onChange={setPayMethod}
          disabled={submitting}
        />

        <View style={styles.totalsCard}>
          <TotalRow label={t("subtotal")} value={money(breakdown.subtotal)} />
          {breakdown.discount > 0 ? (
            <TotalRow label={t("discount")} value={`-${money(breakdown.discount)}`} />
          ) : null}
          <TotalRow label={t("deliveryFee")} value={money(breakdown.deliveryFee)} />
          <View style={styles.totalsDivider} />
          <View style={styles.totalRow}>
            <Text style={styles.grandLabel}>{t("total")}</Text>
            <Text style={styles.grandValue}>{money(breakdown.total)}</Text>
          </View>
        </View>

        {payNotice ? <Text style={styles.notice}>{payNotice}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <BigButton
          label={t("confirmOrder")}
          onPress={submit}
          loading={submitting}
          disabled={lines.length === 0 || !hasAddress}
        />
      </View>
    </View>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.totalRow}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={styles.totalValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.background },
  section: { fontFamily: font.bold, fontSize: 16, color: colors.textPrimary, marginTop: 18, marginBottom: 10 },
  card: {
    backgroundColor: brand.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: brand.border,
    paddingHorizontal: 14,
  },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  divided: { borderTopWidth: 1, borderTopColor: brand.divider },
  itemName: { fontFamily: font.medium, fontSize: 15, color: colors.textPrimary },
  itemUnit: { fontFamily: font.regular, fontSize: 12.5, color: brand.onSoftMuted, marginTop: 2 },
  lineTotal: {
    flexShrink: 0,
    fontFamily: font.semibold,
    fontSize: 15,
    color: colors.textPrimary,
    minWidth: 62,
    textAlign: "right",
  },
  rewardList: { gap: 8 },
  rewardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: brand.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: brand.border,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  rewardRowChosen: { borderColor: brand.moonstoneInk, backgroundColor: brand.moonstoneSoft },
  rewardIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  rewardTitle: { fontFamily: font.semibold, fontSize: 14, color: colors.textPrimary },
  rewardMeta: { fontFamily: font.regular, fontSize: 11.5, color: brand.onSoftMuted, marginTop: 2 },
  rewardAction: { flexShrink: 0, fontFamily: font.semibold, fontSize: 12.5, color: brand.onSoftMuted },
  rewardActionOn: { color: brand.moonstoneInk },
  promoRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  promoInput: {
    flex: 1,
    backgroundColor: brand.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: brand.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: font.regular,
    color: colors.textPrimary,
  },
  promoButton: {
    backgroundColor: brand.moonstoneInk,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    justifyContent: "center",
  },
  promoButtonLabel: { fontFamily: font.semibold, fontSize: 14, color: colors.textInverse },
  addressPick: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: brand.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: brand.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  addressText: {
    fontFamily: font.medium,
    fontSize: 14.5,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  addressPlaceholder: { fontFamily: font.regular, color: brand.onSoftMuted },
  addressChange: {
    fontFamily: font.semibold,
    fontSize: 12,
    color: brand.moonstoneInk,
    marginTop: 3,
  },
  outsideRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 18 },
  outsideTitle: { fontFamily: font.semibold, fontSize: 15, color: colors.textPrimary },
  outsideNote: { fontFamily: font.regular, fontSize: 12.5, color: brand.onSoftMuted, marginTop: 3 },
  photoCard: {
    backgroundColor: brand.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: brand.border,
    padding: 16,
    marginTop: 20,
  },
  photoHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  photoTitle: { flex: 1, fontFamily: font.bold, fontSize: 15, color: colors.textPrimary },
  photoHint: { fontFamily: font.regular, fontSize: 13, lineHeight: 19, color: brand.onSoftMuted, marginTop: 8 },
  thumbRow: { marginTop: 12 },
  thumbWrap: { marginRight: 10 },
  thumb: { width: 68, height: 68, borderRadius: radius.md },
  thumbPlaceholder: {
    backgroundColor: brand.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbRemove: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  photoButtons: { flexDirection: "row", gap: 12, marginTop: 14 },
  photoTile: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: 18,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: brand.moonstoneInk,
    backgroundColor: brand.moonstoneSoft,
  },
  photoTileBusy: { opacity: 0.5 },
  photoTileLabel: { fontFamily: font.medium, fontSize: 12.5, color: brand.moonstoneInk },
  // Informational, not a blocker — photos stopped being mandatory, so this
  // is deliberately not the red danger treatment it used to be.
  photoSuggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: brand.surfaceAlt,
    borderRadius: radius.md,
    padding: 12,
    marginTop: 14,
  },
  photoSuggestionLabel: {
    flex: 1,
    fontFamily: font.regular,
    fontSize: 12.5,
    color: brand.onSoftMuted,
    lineHeight: 18,
  },
  totalsCard: { backgroundColor: brand.surfaceAlt, borderRadius: radius.lg, padding: 18, marginTop: 22 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5 },
  totalLabel: { flex: 1, marginRight: 12, fontFamily: font.regular, fontSize: 15, color: brand.onSoftMuted },
  totalValue: { flexShrink: 0, fontFamily: font.medium, fontSize: 15, color: colors.textPrimary },
  totalsDivider: { height: 1, backgroundColor: brand.border, marginVertical: 10 },
  grandLabel: { flex: 1, marginRight: 12, fontFamily: font.bold, fontSize: 18, color: colors.textPrimary },
  grandValue: { flexShrink: 0, fontFamily: font.bold, fontSize: 18, color: brand.moonstoneInk },
  error: { fontFamily: font.regular, fontSize: 13, color: colors.danger, marginTop: 14 },
  // The order was placed but the money has not arrived — a warning, not a
  // failure, so it must not read like the order was lost.
  notice: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textPrimary,
    backgroundColor: brand.surfaceAlt,
    borderRadius: radius.md,
    padding: 12,
    marginTop: 14,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: brand.divider,
    backgroundColor: brand.background,
  },
});
