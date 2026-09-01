import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal } from "react-native";

import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  brand,
  colors,
  font,
  money,
  radius,
  serviceTheme,
  ITEMISED_SERVICES,
  type ServiceKey,
} from "@/theme/tokens";
import { findService } from "@/lib/catalog";
import { useCatalogCopy } from "@/lib/catalog-i18n";
import { useI18n } from "@/lib/language-context";
import { pluralKey } from "@/lib/i18n";
import { useCart } from "@/lib/state/cart";
import { FREE_DELIVERY_THRESHOLD } from "@/lib/pricing";
import { AddButton, BigButton, IconBubble, Pill, ScreenHeader, Stepper } from "@/components/ui";
import { AppIcon } from "@/components/AppIcon";

// "Xidmət icmalı" — the catalogue. Service circles across the top, a tinted
// hero banner for the active service, then a single flat price list, and a
// floating estimate bar pinned to the bottom.
//
// Chrome is on the coastal palette (`brand`); the per-service tints in
// `serviceTheme` are kept, because they are what tells the five services
// apart at a glance — flattening them into one hue would cost information.
//
// The two orange controls are deliberate exceptions and must stay orange:
// the "+" on each row and "Götürülmə planla" at the bottom. Orange marks
// "this adds to or commits the order" throughout the app, and that meaning
// does not survive being recoloured to match the surface around it.
//
// The list is deliberately flat: no category headers and no accordions, so
// every item is visible and tappable without a disclosure step. Categories
// still exist in lib/catalog.ts (they mirror how service_prices groups rows)
// and are simply flattened for display.
export default function ServiceCatalogueScreen() {
  const { serviceId } = useLocalSearchParams<{ serviceId: string }>();
  const insets = useSafeAreaInsets();
  const { t, lang } = useI18n();
  const { add, setQty, quantityOf, subtotal, count } = useCart();

  const activeId = (serviceId as ServiceKey) ?? "dry_cleaning";
  const service = findService(activeId);
  const copy = useCatalogCopy();
  const theme = serviceTheme[activeId] ?? serviceTheme.dry_cleaning;

  const [upsellOpen, setUpsellOpen] = useState(false);

  const items = useMemo(
    () => service.categories.flatMap((category) => category.items),
    [service]
  );

  const goToCheckout = () => {
    if (subtotal > 0 && subtotal < FREE_DELIVERY_THRESHOLD) {
      setUpsellOpen(true);
      return;
    }
    router.push("/checkout/schedule");
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenHeader title={t("serviceOverview")} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 150 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Six circles no longer fit across a phone at this size, so the row
            scrolls instead of squeezing them together; adding a service later
            can't crush the spacing either. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.serviceRow}
        >
          {ITEMISED_SERVICES.map((key) => {
            const entryTheme = serviceTheme[key];
            return (
              <Pressable key={key} onPress={() => router.replace(`/service/${key}`)}>
                <IconBubble
                  name={entryTheme.icon}
                  tint={entryTheme.tint}
                  fg={entryTheme.fg}
                  size={56}
                  selected={key === activeId}
                />
              </Pressable>
            );
          })}
          {/* Bulk sits alongside the price lists but leads somewhere else —
              it has no items to browse, only a deposit and a pickup slot. */}
          <Pressable onPress={() => router.push("/toplu")}>
            <IconBubble
              name={serviceTheme.toplu.icon}
              tint={serviceTheme.toplu.tint}
              fg={serviceTheme.toplu.fg}
              size={56}
            />
          </Pressable>
        </ScrollView>

        <View style={[styles.heroBanner, { backgroundColor: theme.tint }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName}>{copy.label(activeId, theme.label)}</Text>
            <Text style={styles.heroTagline}>{copy.tagline(service)}</Text>
          </View>
          <View style={[styles.heroIcon, { backgroundColor: "rgba(255,255,255,0.45)" }]}>
            <AppIcon name={service.icon} size={34} color={theme.fg} />
          </View>
        </View>

        <View style={styles.priceHeader}>
          <View style={styles.priceHeaderText}>
            <Text style={styles.priceTitle}>{t("priceList")}</Text>
            <Text style={styles.priceSubtitle}>{t("pricePerItem")}</Text>
          </View>
          <Text style={styles.priceCount} numberOfLines={1}>
            {items.length} {t(pluralKey(lang, "products", items.length))}
          </Text>
        </View>

        <View style={styles.list}>
          {items.map((item) => {
            const qty = quantityOf(service.serviceId, item.itemId);
            return (
              <View key={item.itemId} style={styles.itemRow}>
                <Text style={styles.itemName}>{copy.item(item)}</Text>
                <Text style={styles.itemPrice}>{money(item.price)}</Text>
                {qty > 0 ? (
                  <Stepper
                    tone="brand"
                    value={qty}
                    onChange={(next) => setQty(service.serviceId, item.itemId, next)}
                  />
                ) : (
                  <AddButton
                    onPress={() =>
                      add({
                        serviceId: service.serviceId,
                        itemId: item.itemId,
                        // The basket keeps the reader's rendering, so the
                        // summary and the order both read back the same.
                        name: copy.item(item),
                        price: item.price,
                      })
                    }
                  />
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.helpCard}>
          <Text style={styles.helpTitle}>{t("cantFindItem")}</Text>
          <Text style={styles.helpLink}>{t("writeToTeam")}</Text>
        </View>
      </ScrollView>

      {count > 0 ? (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.bottomCard}>
            <View style={styles.bottomPrice}>
              <View style={styles.bottomTotalRow}>
                <Text style={styles.bottomTotal}>{money(subtotal)}</Text>
                <Pill label={String(count)} tone="brand" />
              </View>
              <Text style={styles.bottomHint} numberOfLines={1}>
                {t("estimatedPrice")}
              </Text>
            </View>
            <BigButton
              label={t("schedulePickup")}
              iconRight="arrow-forward"
              onPress={goToCheckout}
              style={styles.bottomButton}
            />
          </View>
        </View>
      ) : null}

      <Modal transparent visible={upsellOpen} animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("freeDeliveryTitle")}</Text>
            <Text style={styles.modalBody}>
              {t("freeDeliveryBody", {
                total: money(subtotal),
                threshold: money(FREE_DELIVERY_THRESHOLD),
              })}
            </Text>
            <Pressable
              style={styles.modalPrimary}
              onPress={() => {
                setUpsellOpen(false);
                router.push("/checkout/schedule");
              }}
            >
              <Text style={styles.modalPrimaryLabel}>{t("continueOrder")}</Text>
            </Pressable>
            <Pressable style={styles.modalSecondary} onPress={() => setUpsellOpen(false)}>
              <Text style={styles.modalSecondaryLabel}>{t("decline")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.background },
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  heroBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: radius.lg,
    padding: 18,
  },
  heroName: { fontFamily: font.extrabold, fontSize: 21, letterSpacing: -0.3, color: colors.textPrimary },
  heroTagline: {
    fontFamily: font.regular,
    fontSize: 13.5,
    // Left on the neutral grey rather than brand.onSoftMuted: this line sits
    // on the per-service tint, which ranges from periwinkle to pink, and a
    // teal-cast grey clashes against half of them.
    color: colors.textSecondary,
    marginTop: 4,
  },
  heroIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  priceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: 22,
    marginBottom: 10,
  },
  priceHeaderText: { flex: 1, marginRight: 12 },
  priceTitle: { fontFamily: font.extrabold, fontSize: 18, letterSpacing: -0.3, color: colors.textPrimary },
  priceSubtitle: { fontFamily: font.regular, fontSize: 12.5, color: brand.onSoftMuted },
  priceCount: { flexShrink: 0, fontFamily: font.medium, fontSize: 12.5, color: brand.onSoftMuted },
  list: { marginHorizontal: 16, gap: 10 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: brand.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: brand.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  itemName: { flex: 1, fontFamily: font.regular, fontSize: 15, color: colors.textPrimary },
  itemPrice: { flexShrink: 0, fontFamily: font.semibold, fontSize: 15, color: colors.textPrimary },
  helpCard: {
    marginHorizontal: 16,
    marginTop: 6,
    backgroundColor: brand.moonstoneSoft,
    borderRadius: radius.md,
    padding: 16,
  },
  helpTitle: { fontFamily: font.semibold, fontSize: 14, color: colors.textPrimary },
  helpLink: { fontFamily: font.medium, fontSize: 14, color: brand.moonstoneInk, marginTop: 3 },
  bottomBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 14 },
  bottomCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: brand.surface,
    borderRadius: radius.xl,
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 12,
    shadowColor: brand.midnight,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  bottomPrice: { flexShrink: 1 },
  bottomTotalRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  bottomTotal: { fontFamily: font.bold, fontSize: 21, color: colors.textPrimary },
  bottomHint: { fontFamily: font.regular, fontSize: 12, color: brand.onSoftMuted, marginTop: 2 },
  bottomButton: { flexShrink: 0, maxWidth: "62%", paddingHorizontal: 20, paddingVertical: 14 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,69,84,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  modalCard: {
    width: "100%",
    backgroundColor: brand.surface,
    borderRadius: radius.xl,
    padding: 22,
  },
  modalTitle: { fontFamily: font.bold, fontSize: 18, color: colors.textPrimary },
  modalBody: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    color: brand.onSoftMuted,
    marginTop: 8,
  },
  // "Sifarişi davam etdir" commits the basket to checkout, so it takes the
  // same orange as every other commit CTA rather than the old blue.
  modalPrimary: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  modalPrimaryLabel: { fontFamily: font.semibold, fontSize: 15, color: colors.textInverse },
  modalSecondary: { paddingVertical: 12, alignItems: "center", marginTop: 4 },
  modalSecondaryLabel: { fontFamily: font.medium, fontSize: 15, color: brand.onSoftMuted },
});
