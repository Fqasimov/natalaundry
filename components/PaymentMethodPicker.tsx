import { View, Text, Pressable, StyleSheet } from "react-native";
import { AppIcon, type IconName } from "@/components/AppIcon";
import { useI18n } from "@/lib/language-context";
import type { StringKey } from "@/lib/i18n";
import { colors, font, radius } from "@/theme/tokens";
import type { PaymentMethod } from "@/lib/payments";

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
}: {
  methods: PaymentMethod[];
  value: PaymentMethod | null;
  onChange: (method: PaymentMethod) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();

  return (
    <View style={styles.list}>
      {methods.map((method) => {
        const look = PRESENTATION[method];
        if (!look) return null;
        const chosen = value === method;

        return (
          <Pressable
            key={method}
            disabled={disabled}
            onPress={() => onChange(method)}
            accessibilityRole="radio"
            accessibilityState={{ selected: chosen, disabled }}
            accessibilityLabel={t(look.label)}
            style={[
              styles.row,
              chosen && styles.rowChosen,
              disabled && styles.rowDisabled,
            ]}
          >
            <View style={[styles.iconWrap, chosen && styles.iconWrapChosen]}>
              <AppIcon
                name={look.icon}
                size={19}
                color={chosen ? colors.textInverse : colors.textSecondary}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{t(look.label)}</Text>
              {look.note ? <Text style={styles.note}>{t(look.note)}</Text> : null}
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
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 13,
    paddingVertical: 13,
  },
  rowChosen: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  rowDisabled: { opacity: 0.5 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  iconWrapChosen: { backgroundColor: colors.primary },
  label: { fontFamily: font.semibold, fontSize: 14.5, color: colors.textPrimary },
  note: { fontFamily: font.regular, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: colors.primary },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
});
