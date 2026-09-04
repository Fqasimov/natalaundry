import { View, Text, StyleSheet, Pressable, Linking, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { colors, font, money, radius, type } from "@/theme/tokens";
import { useI18n } from "@/lib/language-context";
import { LIFECYCLE_LABEL, courierNextStep, isTracking } from "@/lib/lifecycle";
import { hasCoordinates, openNavigation } from "@/lib/navigation-links";
import { formatDistance, formatDuration, type Route } from "@/lib/routing";
import type { Order, OrderItem } from "@/types/database";

/**
 * The job a courier is working: where, what, who, and the one button that
 * moves it forward.
 *
 * Shared by the home tab and the deliveries tab rather than written twice —
 * the two showed the same job in different words before, and a courier
 * checking one against the other should not find them disagreeing.
 */
export function ActiveJobCard({
  order,
  items,
  customer,
  route,
  sharing,
  busy,
  onAdvance,
}: {
  order: Order;
  items: OrderItem[];
  customer: { name: string | null; phone: string | null } | null;
  route: Route | null;
  sharing: boolean;
  busy: boolean;
  onAdvance: () => void;
}) {
  const { t } = useI18n();
  const next = courierNextStep(order.lifecycle_state);
  const canNavigate = hasCoordinates(order.address_lat, order.address_lng);

  return (
    <View style={s.card}>
      <View style={s.top}>
        <View style={s.badge}>
          <Text style={s.badgeLabel}>
            {t(LIFECYCLE_LABEL[order.lifecycle_state] ?? "stateOrderPlaced")}
          </Text>
        </View>
        <Text style={s.total}>{money(order.total)}</Text>
      </View>

      <Text style={s.orderNo}>{t("orderNo", { no: order.order_no ?? "—" })}</Text>
      <Text style={s.address}>{order.address ?? "—"}</Text>

      {route ? (
        <View style={s.routeRow}>
          <Ionicons name="navigate-outline" size={14} color={colors.primary} />
          <Text style={s.routeLabel}>
            {t("courierRouteAway", {
              distance: formatDistance(route.distanceM),
              minutes: formatDuration(route.durationS),
            })}
          </Text>
        </View>
      ) : null}

      {isTracking(order.lifecycle_state) ? (
        <View style={s.gpsRow}>
          <View style={[s.dot, { backgroundColor: sharing ? colors.success : colors.amber }]} />
          <Text style={s.gpsLabel}>
            {sharing ? t("locationSharing") : t("locationSharingOff")}
          </Text>
        </View>
      ) : null}

      {customer?.name || customer?.phone ? (
        <View style={s.customerRow}>
          <View style={s.customerText}>
            <Text style={s.eyebrow}>{t("courierJobCustomer")}</Text>
            <Text style={s.customerName} numberOfLines={1}>
              {customer?.name ?? "—"}
            </Text>
          </View>
          {customer?.phone ? (
            <Pressable style={s.call} onPress={() => Linking.openURL(`tel:${customer.phone}`)}>
              <Ionicons name="call-outline" size={16} color={colors.textInverse} />
              <Text style={s.callLabel}>{t("courierCall")}</Text>
            </Pressable>
          ) : (
            <Text style={s.eyebrow}>{t("courierNoPhone")}</Text>
          )}
        </View>
      ) : null}

      {items.length > 0 ? (
        <View style={s.items}>
          <Text style={s.eyebrow}>{t("courierJobItems")}</Text>
          {items.map((line) => (
            <View key={line.id} style={s.itemRow}>
              <Text style={s.itemName} numberOfLines={1}>
                {line.item_name}
              </Text>
              <Text style={s.itemQty}>×{line.quantity}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={s.actions}>
        {canNavigate ? (
          <Pressable
            style={s.secondary}
            onPress={() =>
              // Couriers navigate in Google Maps, by instruction — it is what
              // they already drive with here, and its traffic and address
              // matching are better in Baku than Apple Maps'. Everywhere else
              // in the app keeps the platform's own maps app (preferNative),
              // so this deliberately does NOT pass that flag.
              openNavigation(order.address_lat as number, order.address_lng as number, {
                label: order.address ?? undefined,
              })
            }
          >
            <Ionicons name="navigate" size={16} color={colors.primary} />
            <Text style={s.secondaryLabel} numberOfLines={1}>
              {t("navigateApp")}
            </Text>
          </Pressable>
        ) : null}

        <Pressable style={s.secondary} onPress={() => router.push(`/order/${order.id}`)}>
          <Ionicons name="document-text-outline" size={16} color={colors.primary} />
          <Text style={s.secondaryLabel} numberOfLines={1}>
            {t("courierOpenOrder")}
          </Text>
        </Pressable>
      </View>

      {next ? (
        <Pressable style={[s.primary, busy && s.disabled]} disabled={busy} onPress={onAdvance}>
          {busy ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={s.primaryLabel}>{t(next.label)}</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 16,
    gap: 6,
    // Soft lift rather than a border: the design's cards float on the ivory.
    shadowColor: "#1B1A16",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeLabel: { fontFamily: font.semibold, fontSize: 12, color: colors.primaryDark },
  total: { fontFamily: font.bold, fontSize: 18, color: colors.textPrimary },
  orderNo: { ...type.caption, color: colors.textSecondary },
  address: { ...type.bodyMedium, color: colors.textPrimary },

  routeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  routeLabel: { ...type.bodyMedium, color: colors.primary },

  gpsRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  gpsLabel: { ...type.caption, color: colors.textSecondary },

  eyebrow: { ...type.eyebrow, color: colors.textSecondary },
  customerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 10,
  },
  customerText: { flexShrink: 1, gap: 2 },
  customerName: { ...type.bodyMedium, color: colors.textPrimary },
  call: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  callLabel: { fontFamily: font.semibold, fontSize: 13, color: colors.textInverse },

  items: { marginTop: 10, gap: 4 },
  itemRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  itemName: { ...type.body, color: colors.textPrimary, flexShrink: 1 },
  itemQty: { ...type.bodyMedium, color: colors.textSecondary },

  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  secondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.md,
    paddingVertical: 11,
    backgroundColor: colors.primarySoft,
  },
  secondaryLabel: { fontFamily: font.semibold, fontSize: 13, color: colors.primaryDark },

  primary: {
    marginTop: 8,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.accent,
  },
  primaryLabel: { fontFamily: font.bold, fontSize: 15, color: colors.textInverse },
  disabled: { opacity: 0.6 },
});
