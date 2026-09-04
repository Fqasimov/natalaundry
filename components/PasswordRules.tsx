import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, radius } from "@/theme/tokens";
import { useI18n } from "@/lib/language-context";
import { passwordChecks } from "@/lib/password";

/**
 * The password rules, ticking off as they are met.
 *
 * Shown from the moment the field is focused rather than after a failed
 * submit: the customer is choosing a password at that instant, and telling
 * them the constraints afterwards means asking them to think of another one.
 *
 * Unmet rules are stated in the ordinary text colour, not red. Nothing has
 * gone wrong yet — the customer is halfway through typing — and colouring a
 * half-finished password as an error is what makes forms feel hostile. Red is
 * kept for a real failure, which by then arrives as an alert instead.
 */
export function PasswordRules({ password, visible = true }: { password: string; visible?: boolean }) {
  const { t } = useI18n();
  if (!visible) return null;

  return (
    <View style={s.wrap}>
      {passwordChecks(password).map(({ key, met }) => (
        <View key={key} style={s.row}>
          <Ionicons
            name={met ? "checkmark-circle" : "ellipse-outline"}
            size={15}
            color={met ? colors.success : colors.textSecondary}
          />
          <Text style={[s.label, met && s.labelMet]}>{t(key)}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    marginTop: 8,
    gap: 5,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 7 },
  label: { fontFamily: font.regular, fontSize: 12.5, color: colors.textSecondary },
  labelMet: { color: colors.textPrimary },
});
