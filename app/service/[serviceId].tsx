import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal } from "react-native";

import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  colors,
  font,
  money,
  radius,
  serviceTheme,
  ITEMISED_SERVICES,
  type ServiceKey,
} from "@/theme/tokens";
import { findService } from "@/lib/catalog";
import { useI18n } from "@/lib/language-context";
import { useCart } from "@/lib/state/cart";
import { FREE_DELIVERY_THRESHOLD } from "@/lib/pricing";
import { AddButton, BigButton, IconBubble, Pill, ScreenHeader, Stepper } from "@/components/ui";
import { AppIcon } from "@/components/AppIcon";

// "Xidmət icmalı" — the catalogue. Service circles across the top, a tinted
// hero banner for the active service, then a single flat price list, and a
// floating estimate bar pinned to the bottom.
//
// The list is deliberately flat: no category headers and no accordions, so
// every item is visible and tappable without a disclosure step. Categories
// still exist in lib/catalog.ts (they mirror how service_prices groups rows)
// and are simply flattened for display.
export default function ServiceCatalogueScreen() {
  const { serviceId } = useLocalSearchParams<{ serviceId: string }>();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { add, setQty, quantityOf, subtotal, count } = useCart();

  const activeId = (serviceId as ServiceKey) ?? "dry_cleaning";
  const service = findService(activeId);
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
            <Text style={styles.heroName}>{theme.label}</Text>
            <Text style={styles.heroTagline}>{service.tagline}</Text>
            <Pressable style={[styles.heroButton, { backgroundColor: theme.fg }]}>
              <Text style={styles.heroButtonLabel}>{t("more")}</Text>
            </Pressable>
          </View>
          <View style={[styles.heroIcon, { backgroundColor: "rgba(255,255,255,0.45)" }]}>
            <AppIcon name={service.icon} size={34} color={theme.fg} />
          </View>
        </View>

        <View style={styles.priceHeader}>
          <View>
            <Text style={styles.priceTitle}>{t("priceList")}</Text>
            <Text style={styles.priceSubtitle}>{t("pricePerItem")}</Text>
          </View>
          <Text style={styles.priceCount}>
            {items.length} {t("products")}
          </Text>
        </View>

        <View style={styles.list}>
          {items.map((item, index) => {
            const qty = quantityOf(service.serviceId, item.itemId);
            return (
              <View
                key={item.itemId}
                style={[styles.itemRow, index > 0 && styles.itemRowDivided]}
              >
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemPrice}>{money(item.price)}</Text>
                {qty > 0 ? (
                  <Stepper
                    value={qty}
                    onChange={(next) => setQty(service.serviceId, item.itemId, next)}
                  />
                ) : (
                  <AddButton
                    onPress={() =>
                      add({
                        serviceId: service.serviceId,
                        itemId: item.itemId,
                        name: item.name,
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
            <View>
              <View style={styles.bottomTotalRow}>
                <Text style={styles.bottomTotal}>{money(subtotal)}</Text>
                <Pill label={String(count)} tone="primary" />
              </View>
              <Text style={styles.bottomHint}>{t("estimatedPrice")}</Text>
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
  root: { flex: 1, backgroundColor: colors.background },
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
    color: colors.textSecondary,
    marginTop: 4,
  },
  heroButton: {
    alignSelf: "flex-start",
    borderRadius: radius.sm,
    paddingHorizontal: 18,
    paddingVertical: 9,
    marginTop: 14,
  },
  heroButtonLabel: { fontFamily: font.semibold, fontSize: 13, color: colors.textInverse },
  heroIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  priceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: 22,
    marginBottom: 10,
  },
  priceTitle: { fontFamily: font.extrabold, fontSize: 18, letterSpacing: -0.3, color: colors.textPrimary },
  priceSubtitle: { fontFamily: font.regular, fontSize: 12.5, color: colors.textSecondary },
  priceCount: { fontFamily: font.medium, fontSize: 12.5, color: colors.textSecondary },
  list: {
    marginHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  itemRowDivided: { borderTopWidth: 1, borderTopColor: colors.divider },
  itemName: { flex: 1, fontFamily: font.regular, fontSize: 15, color: colors.textPrimary },
  itemPrice: { fontFamily: font.semibold, fontSize: 15, color: colors.textPrimary },
  helpCard: {
    marginHorizontal: 16,
    marginTop: 6,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: 16,
  },
  helpTitle: { fontFamily: font.semibold, fontSize: 14, color: colors.textPrimary },
  helpLink: { fontFamily: font.medium, fontSize: 14, color: colors.primary, marginTop: 3 },
  bottomBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 14 },
  bottomCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingHorizontal: 18,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  bottomTotalRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  bottomTotal: { fontFamily: font.bold, fontSize: 21, color: colors.textPrimary },
  bottomHint: { fontFamily: font.regular, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  bottomButton: { paddingHorizontal: 20, paddingVertical: 14 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,20,28,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  modalCard: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 22,
  },
  modalTitle: { fontFamily: font.bold, fontSize: 18, color: colors.textPrimary },
  modalBody: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    marginTop: 8,
  },
  modalPrimary: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  modalPrimaryLabel: { fontFamily: font.semibold, fontSize: 15, color: colors.textInverse },
  modalSecondary: { paddingVertical: 12, alignItems: "center", marginTop: 4 },
  modalSecondaryLabel: { fontFamily: font.medium, fontSize: 15, color: colors.textSecondary },
});
