import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppIcon } from "@/components/AppIcon";
import { BigButton } from "@/components/ui";
import { useI18n } from "@/lib/language-context";
import { waitForSettlement, type PaymentStatus } from "@/lib/payments";
import { colors, font, radius } from "@/theme/tokens";

/**
 * Where the bank's redirect lands.
 *
 * The API's callback verifies the payment with Kapital and then bounces the
 * browser to natalaundry://payment/{orderId}?status=..., which expo-router
 * resolves here. The status in that URL is only used to pick the first thing
 * to show — the real state is re-fetched from the server, because this route
 * can also be reached by hand.
 *
 * Normally the customer never sees this screen for long: openAuthSessionAsync
 * closes on the redirect and the checkout screen handles the result itself.
 * This exists for the cases where it doesn't — a cold start from the deep
 * link, or a browser that hands off to the OS instead of closing.
 */
export default function PaymentReturnScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { orderId, status } = useLocalSearchParams<{ orderId: string; status?: string }>();

  const [state, setState] = useState<PaymentStatus | "checking">("checking");

  useEffect(() => {
    let cancelled = false;

    if (!orderId || orderId === "unknown") {
      setState("failed");
      return;
    }

    waitForSettlement(orderId)
      .then((result) => {
        if (!cancelled) setState(result.payment_status);
      })
      .catch(() => {
        // Could not reach our own API. Don't claim a result either way.
        if (!cancelled) setState("unconfirmed");
      });

    return () => {
      cancelled = true;
    };
  }, [orderId, status]);

  const done = state !== "checking";
  const paid = state === "paid";
  const pending = state === "pending" || state === "unconfirmed";

  const message = !done
    ? t("payProcessing")
    : paid
      ? t("paySuccess")
      : pending
        ? t("payPendingNotice")
        : state === "cancelled"
          ? t("payCancelled")
          : t("payFailed");

  return (
    <View style={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.body}>
        {!done ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : (
          <View
            style={[
              styles.badge,
              { backgroundColor: paid ? colors.primarySoft : colors.surfaceAlt },
            ]}
          >
            <AppIcon
              name={paid ? "ion:checkmark-circle" : pending ? "ion:time-outline" : "ion:close-circle"}
              size={44}
              color={paid ? colors.primary : pending ? colors.textSecondary : colors.danger}
            />
          </View>
        )}

        <Text style={styles.message}>{message}</Text>
      </View>

      {done ? (
        <View style={styles.footer}>
          <BigButton
            label={t("viewOrder")}
            onPress={() =>
              router.replace(orderId && orderId !== "unknown" ? `/order/${orderId}` : "/(tabs)")
            }
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 24 },
  body: { flex: 1, alignItems: "center", justifyContent: "center", gap: 20 },
  badge: {
    width: 88,
    height: 88,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    fontFamily: font.medium,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textPrimary,
    textAlign: "center",
  },
  footer: { paddingTop: 12 },
});
