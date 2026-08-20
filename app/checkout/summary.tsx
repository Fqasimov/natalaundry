import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Switch, TextInput, Alert, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, money, radius } from "@/theme/tokens";
import { useI18n } from "@/lib/language-context";
import { useCart } from "@/lib/state/cart";
import { useAuth } from "@/lib/auth-context";
import { REQUIRED_PHOTOS } from "@/lib/pricing";
import { createOrder } from "@/lib/orders";
import { BigButton, Pill, ScreenHeader, Stepper } from "@/components/ui";

// "Sifariş xülasəsi" — the final step. Note the hard gate the shipped app
// enforces: at least three garment photos before the order can be submitted.
export default function SummaryScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { session } = useAuth();
  const { lines, draft, patchDraft, setQty, breakdown, reset } = useCart();
  const [submitting, setSubmitting] = useState(false);
  const [promoDraft, setPromoDraft] = useState(draft.promoCode);
  const [error, setError] = useState<string | null>(null);

  const photosOk = draft.photos.length >= REQUIRED_PHOTOS;

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

    if (!result.canceled && result.assets?.[0]) {
      patchDraft({ photos: [...draft.photos, result.assets[0].uri] });
    }
  };

  const applyPromo = () => {
    // Promo validation belongs to the API — this only records the entered
    // code so the server can price it. No client-side discount is invented.
    patchDraft({ promoCode: promoDraft.trim().toUpperCase() });
  };

  const submit = async () => {
    if (!session?.user.id) return;
    if (!photosOk) {
      Alert.alert(t("photosRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const order = await createOrder({
        userId: session.user.id,
        lines,
        subtotal: breakdown.subtotal,
        discount: breakdown.discount,
        deliveryFee: breakdown.deliveryFee,
        total: breakdown.total,
        tier: draft.tier,
        collectionTime: `${draft.pickupDay}, ${draft.pickupSlot}`,
        deliveryTime: `${draft.deliveryDay}, ${draft.deliverySlot}`,
        address: draft.address,
        addressLat: null,
        addressLng: null,
        notes: draft.courierNote || null,
        isOutsideCity: draft.isOutsideCity,
        photos: draft.photos,
      });
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
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="characters"
            value={promoDraft}
            onChangeText={setPromoDraft}
          />
          <Pressable style={styles.promoButton} onPress={applyPromo}>
            <Text style={styles.promoButtonLabel}>{t("apply")}</Text>
          </Pressable>
        </View>

        <Text style={styles.section}>{t("deliveryAddress")}</Text>
        <TextInput
          style={styles.addressInput}
          placeholder={t("addNewAddress")}
          placeholderTextColor={colors.textSecondary}
          value={draft.address}
          onChangeText={(address) => patchDraft({ address })}
        />

        <View style={styles.outsideRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.outsideTitle}>{t("outsideCity")}</Text>
            <Text style={styles.outsideNote}>{t("outsideCityNote")}</Text>
          </View>
          <Switch
            value={draft.isOutsideCity}
            onValueChange={(isOutsideCity) => patchDraft({ isOutsideCity })}
            trackColor={{ true: colors.primary, false: "#D8D8DE" }}
          />
        </View>

        <View style={styles.photoCard}>
          <View style={styles.photoHeader}>
            <Ionicons name="camera" size={22} color={colors.primary} />
            <Text style={styles.photoTitle}>{t("photosTitle")}</Text>
            <Pill
              label={`${draft.photos.length}/${REQUIRED_PHOTOS}`}
              tone={photosOk ? "success" : "danger"}
            />
          </View>
          <Text style={styles.photoHint}>{t("photosHint")}</Text>

          {draft.photos.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbRow}>
              {draft.photos.map((uri, index) => (
                <View key={uri} style={styles.thumbWrap}>
                  <Image source={{ uri }} style={styles.thumb} />
                  <Pressable
                    style={styles.thumbRemove}
                    onPress={() =>
                      patchDraft({ photos: draft.photos.filter((_, i) => i !== index) })
                    }
                  >
                    <Ionicons name="close" size={12} color={colors.textInverse} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}

          <View style={styles.photoButtons}>
            <Pressable style={styles.photoTile} onPress={() => addPhoto("camera")}>
              <Ionicons name="camera-outline" size={24} color={colors.primary} />
              <Text style={styles.photoTileLabel}>{t("takePhoto")}</Text>
            </Pressable>
            <Pressable style={styles.photoTile} onPress={() => addPhoto("library")}>
              <Ionicons name="images-outline" size={24} color={colors.primary} />
              <Text style={styles.photoTileLabel}>{t("pickFromGallery")}</Text>
            </Pressable>
          </View>

          {!photosOk ? (
            <View style={styles.photoWarning}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.photoWarningLabel}>{t("photosRequired")}</Text>
            </View>
          ) : null}
        </View>

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

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <BigButton
          label={t("confirmOrder")}
          onPress={submit}
          loading={submitting}
          disabled={!photosOk || lines.length === 0}
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
  root: { flex: 1, backgroundColor: colors.background },
  section: { fontFamily: font.bold, fontSize: 16, color: colors.textPrimary, marginTop: 18, marginBottom: 10 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
  },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  divided: { borderTopWidth: 1, borderTopColor: colors.divider },
  itemName: { fontFamily: font.medium, fontSize: 15, color: colors.textPrimary },
  itemUnit: { fontFamily: font.regular, fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
  lineTotal: { fontFamily: font.semibold, fontSize: 15, color: colors.textPrimary, minWidth: 62, textAlign: "right" },
  promoRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  promoInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: font.regular,
    color: colors.textPrimary,
  },
  promoButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    justifyContent: "center",
  },
  promoButtonLabel: { fontFamily: font.semibold, fontSize: 14, color: colors.textInverse },
  addressInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontFamily: font.regular,
    color: colors.textPrimary,
  },
  outsideRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 18 },
  outsideTitle: { fontFamily: font.semibold, fontSize: 15, color: colors.textPrimary },
  outsideNote: { fontFamily: font.regular, fontSize: 12.5, color: colors.textSecondary, marginTop: 3 },
  photoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginTop: 20,
  },
  photoHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  photoTitle: { flex: 1, fontFamily: font.bold, fontSize: 15, color: colors.textPrimary },
  photoHint: { fontFamily: font.regular, fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginTop: 8 },
  thumbRow: { marginTop: 12 },
  thumbWrap: { marginRight: 10 },
  thumb: { width: 68, height: 68, borderRadius: radius.md },
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
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  photoTileLabel: { fontFamily: font.medium, fontSize: 12.5, color: colors.primary },
  photoWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: 12,
    marginTop: 14,
  },
  photoWarningLabel: { flex: 1, fontFamily: font.regular, fontSize: 12.5, color: colors.danger, lineHeight: 18 },
  totalsCard: { backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, padding: 18, marginTop: 22 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5 },
  totalLabel: { fontFamily: font.regular, fontSize: 15, color: colors.textSecondary },
  totalValue: { fontFamily: font.medium, fontSize: 15, color: colors.textPrimary },
  totalsDivider: { height: 1, backgroundColor: "#DCDCE2", marginVertical: 10 },
  grandLabel: { fontFamily: font.bold, fontSize: 18, color: colors.textPrimary },
  grandValue: { fontFamily: font.bold, fontSize: 18, color: colors.primary },
  error: { fontFamily: font.regular, fontSize: 13, color: colors.danger, marginTop: 14 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.background,
  },
});
