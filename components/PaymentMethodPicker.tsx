import { View, Text, Pressable, StyleSheet } from "react-native";
import { AppIcon, type IconName } from "@/components/AppIcon";
import { useI18n } from "@/lib/language-context";
import type { StringKey } from "@/lib/i18n";
import { brand, colors, font, money, radius } from "@/theme/tokens";
import { isMethodUnavailable, type PaymentMethod } from "@/lib/payments";

/**
 * How the customer wants to pay.
 *
 * The list is handed in rather than decided here: whether the wallet options
 * appear at all depends on the merchant terminal's configuration at Kapital
 * Bank, which only the server knows (see lib/payments.ts).
 */

type Presentation = {
  label: StringKey;
  note: StringKey | null;
  icon: IconName;
};

const PRESENTATION: Record<PaymentMethod, Presentation> = {
  balance: { label: "walletPayWith", note: null, icon: "mci:wallet-outline" },
  card: { label: "payMethodCard", note: "payMethodCardNote", icon: "mci:credit-card-outline" },
  cash: { label: "payMethodCash", note: "payMethodCashNote", icon: "mci:cash" },
  apple_pay: { label: "payMethodApple", note: null, icon: "ion:logo-apple" },
  google_pay: { label: "payMethodGoogle", note: null, icon: "ion:logo-google" },
};

export function PaymentMethodPicker({
  methods,
  value,
  onChange,
  disabled = false,
  balance = null,
  amountDue = 0,
}: {
  methods: PaymentMethod[];
  value: PaymentMethod | null;
  onChange: (method: PaymentMethod) => void;
  disabled?: boolean;
  /** Nata Balance, from GET /wallet. Null while it is still loading. */
  balance?: number | null;
  /** What this order costs, so the balance row can say whether it covers it. */
  amountDue?: number;
}) {
  const { t } = useI18n();

  return (
    <View style={styles.list}>
      {methods.map((method) => {
        const look = PRESENTATION[method];
        if (!look) return null;
        const chosen = value === method;

        // Nata Balance is offered but not selectable when it cannot cover the
        // order. The server refuses the debit either way — this only saves the
        // customer from finding that out at the last step.
        const isBalance = method === "balance";
        const shortOfFunds =
          isBalance && balance !== null && amountDue > 0 && balance < amountDue;
        // Card and the wallets are shown greyed out rather than removed while
        // the bank gateway is off. Removing them reads as a bug to anyone who
        // paid by card on the previous build; a disabled row with a reason
        // reads as a decision.
        const unavailable = isMethodUnavailable(method);
        const rowDisabled = disabled || shortOfFunds || unavailable;

        return (
          <Pressable
            key={method}
            disabled={rowDisabled}
            onPress={() => onChange(method)}
            accessibilityRole="radio"
            accessibilityState={{ selected: chosen, disabled: rowDisabled }}
            accessibilityLabel={t(look.label)}
            style={[
              styles.row,
              chosen && styles.rowChosen,
              rowDisabled && styles.rowDisabled,
            ]}
          >
            <View style={[styles.iconWrap, chosen && styles.iconWrapChosen]}>
              <AppIcon
                name={look.icon}
                size={19}
                color={chosen ? colors.textInverse : brand.onSoftMuted}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.label} numberOfLines={1}>
                {t(look.label)}
              </Text>
              {unavailable ? (
                <Text style={[styles.note, styles.noteWarn]} numberOfLines={2}>
                  {t("payMethodUnavailable")}
                </Text>
              ) : isBalance ? (
                <Text
                  style={[styles.note, shortOfFunds && styles.noteWarn]}
                  numberOfLines={1}
                >
                  {shortOfFunds
                    ? t("walletInsufficient")
                    : balance !== null
                      ? t("walletPayWithNote", { balance: money(balance) })
                      : "…"}
                </Text>
              ) : look.note ? (
                <Text style={styles.note} numberOfLines={2}>
                  {t(look.note)}
                </Text>
              ) : null}
            </View>

            <View style={[styles.radio, chosen && styles.radioOn]}>
              {chosen ? <View style={styles.radioDot} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: brand.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: brand.border,
    paddingHorizontal: 13,
    paddingVertical: 13,
  },
  rowChosen: { borderColor: brand.moonstoneInk, backgroundColor: brand.moonstoneSoft },
  rowDisabled: { opacity: 0.5 },
  iconWrap: {
    flexShrink: 0,
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: brand.surfaceAlt,
  },
  iconWrapChosen: { backgroundColor: brand.moonstoneInk },
  label: { fontFamily: font.semibold, fontSize: 14.5, color: colors.textPrimary },
  note: { fontFamily: font.regular, fontSize: 12, color: brand.onSoftMuted, marginTop: 2 },
  noteWarn: { color: colors.danger },
  radio: {
    flexShrink: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: brand.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: brand.moonstoneInk },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: brand.moonstoneInk,
  },
});
