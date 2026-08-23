import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Switch, Modal, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, money, radius } from "@/theme/tokens";
import { useI18n } from "@/lib/language-context";
import { buildDayLabels } from "@/lib/dates";
import { useCart } from "@/lib/state/cart";
import {
  DELIVERY_TIERS,
  FREE_DELIVERY_THRESHOLD,
  BASE_DELIVERY_FEE,
  deliveryFeeFor,
  type DeliveryTier,
} from "@/lib/pricing";
import { BigButton, ScreenHeader } from "@/components/ui";

const SLOTS = ["10:00 - 12:00", "12:00 - 14:00", "14:00 - 16:00", "16:00 - 18:00", "18:00 - 20:00"];

const TIER_META: Record<
  DeliveryTier,
  { icon: keyof typeof Ionicons.glyphMap; titleKey: "standard" | "express" | "eco"; descKey: "standardDesc" | "expressDesc" | "ecoDesc"; color: string }
> = {
  standard: { icon: "time", titleKey: "standard", descKey: "standardDesc", color: colors.primary },
  express: { icon: "flash", titleKey: "express", descKey: "expressDesc", color: colors.textPrimary },
  eco: { icon: "leaf", titleKey: "eco", descKey: "ecoDesc", color: colors.success },
};

export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const { t, lang } = useI18n();
  const { draft, patchDraft, subtotal } = useCart();
  const [picker, setPicker] = useState<{ field: keyof typeof draft; options: string[] } | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);

  // The day labels follow the reader's language: they were built from a
  // hard-coded Azerbaijani month/weekday table, so an English or Russian
  // customer picked their delivery day off "26 avq, Ç.".
  const days = useMemo(
    () => buildDayLabels(lang, { today: t("today"), tomorrow: t("tomorrow") }),
    [lang, t],
  );
  const handoverGive = [t("handOverInPerson"), t("leaveAtDoor"), t("giveToConcierge")];
  const handoverTake = [t("receiveInPerson"), t("leaveAtDoor"), t("takeFromConcierge")];

  const belowThreshold = subtotal > 0 && subtotal < FREE_DELIVERY_THRESHOLD;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenHeader
        title={t("deliveryTime")}
        rightLabel={t("cancel")}
        onRightPress={() => router.replace("/(tabs)")}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.section}>{t("pickupTime")}</Text>
        <SelectRow
          icon="calendar-outline"
          value={draft.pickupDay || days[1]}
          onPress={() => setPicker({ field: "pickupDay", options: days })}
        />
        <SelectRow
          icon="time-outline"
          value={draft.pickupSlot}
          onPress={() => setPicker({ field: "pickupSlot", options: SLOTS })}
        />
        <SelectRow
          icon="person-outline"
          value={draft.pickupHandover === "in_person" ? t("handOverInPerson") : draft.pickupHandover}
          onPress={() => setPicker({ field: "pickupHandover", options: handoverGive })}
        />

        <Text style={styles.section}>{t("deliveryTime")}</Text>
        <SelectRow
          icon="calendar-outline"
          value={draft.deliveryDay || days[3]}
          onPress={() => setPicker({ field: "deliveryDay", options: days })}
        />
        <SelectRow
          icon="time-outline"
          value={draft.deliverySlot}
          onPress={() => setPicker({ field: "deliverySlot", options: SLOTS })}
        />
        <SelectRow
          icon="person-outline"
          value={draft.deliveryHandover === "in_person" ? t("receiveInPerson") : draft.deliveryHandover}
          onPress={() => setPicker({ field: "deliveryHandover", options: handoverTake })}
        />

        <Text style={styles.section}>{t("deliveryType")}</Text>
        {belowThreshold ? (
          <Text style={styles.warning}>
            {t("belowThresholdFee", {
              threshold: money(FREE_DELIVERY_THRESHOLD),
              fee: money(BASE_DELIVERY_FEE),
            })}
          </Text>
        ) : null}

        {DELIVERY_TIERS.map((tier) => {
          const meta = TIER_META[tier];
          const selected = draft.tier === tier;
          const fee = deliveryFeeFor(subtotal, tier, draft.isOutsideCity);
          return (
            <Pressable
              key={tier}
              style={[styles.tierCard, selected && styles.tierCardSelected]}
              onPress={() => patchDraft({ tier })}
            >
              <View style={styles.tierHeader}>
                <Ionicons name={meta.icon} size={20} color={meta.color} />
                <Text style={[styles.tierTitle, selected && { color: colors.primary }]}>
                  {t(meta.titleKey)}
                </Text>
              </View>
              <Text style={styles.tierDesc}>{t(meta.descKey)}</Text>
              <Text style={[styles.tierFee, tier === "eco" && { color: colors.success }]}>
                +{money(fee)}
              </Text>
            </Pressable>
          );
        })}

        <Pressable style={styles.noteButton} onPress={() => setNoteOpen(true)}>
          <Text style={styles.noteButtonLabel}>
            {draft.courierNote ? draft.courierNote : t("addCourierNote")}
          </Text>
        </Pressable>

        <View style={styles.repeatRow}>
          <Text style={styles.repeatLabel}>{t("repeatOrder")}</Text>
          <Switch
            value={draft.repeatOrder}
            onValueChange={(repeatOrder) => patchDraft({ repeatOrder })}
            trackColor={{ true: colors.primary, false: "#D8D8DE" }}
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <BigButton
          label={t("next")}
          tone="amber"
          onPress={() => {
            if (!draft.pickupDay) patchDraft({ pickupDay: days[1] });
            if (!draft.deliveryDay) patchDraft({ deliveryDay: days[3] });
            router.push("/checkout/summary");
          }}
        />
      </View>

      <Modal transparent visible={!!picker} animationType="fade" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setPicker(null)}>
          <View style={styles.sheet}>
            {picker?.options.map((option) => (
              <Pressable
                key={option}
                style={styles.sheetRow}
                onPress={() => {
                  patchDraft({ [picker.field]: option } as never);
                  setPicker(null);
                }}
              >
                <Text style={styles.sheetLabel}>{option}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal transparent visible={noteOpen} animationType="fade" onRequestClose={() => setNoteOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.noteSheet}>
            <Text style={styles.noteTitle}>{t("addCourierNote")}</Text>
            <TextInput
              style={styles.noteInput}
              multiline
              value={draft.courierNote}
              onChangeText={(courierNote) => patchDraft({ courierNote })}
            />
            <BigButton label={t("save")} tone="primary" onPress={() => setNoteOpen(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SelectRow({
  icon,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.selectRow} onPress={onPress}>
      <Ionicons name={icon} size={18} color={colors.textSecondary} />
      <Text style={styles.selectValue}>{value}</Text>
      <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  section: { fontFamily: font.bold, fontSize: 16, color: colors.textPrimary, marginTop: 20, marginBottom: 10 },
  selectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 8,
  },
  selectValue: { flex: 1, fontFamily: font.regular, fontSize: 15, color: colors.textPrimary },
  warning: { fontFamily: font.regular, fontSize: 12.5, color: colors.danger, marginBottom: 10, lineHeight: 18 },
  tierCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 10,
  },
  tierCardSelected: { borderColor: colors.primary, backgroundColor: "#F7FAFF" },
  tierHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  tierTitle: { fontFamily: font.semibold, fontSize: 16, color: colors.textPrimary },
  tierDesc: { fontFamily: font.regular, fontSize: 13, color: colors.textSecondary, marginTop: 6 },
  tierFee: { fontFamily: font.semibold, fontSize: 15, color: colors.textPrimary, marginTop: 8 },
  noteButton: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 14,
  },
  noteButtonLabel: { fontFamily: font.medium, fontSize: 15, color: colors.primary },
  repeatRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 20,
  },
  repeatLabel: { fontFamily: font.semibold, fontSize: 15, color: colors.textPrimary },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.background,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,20,28,0.5)",
    justifyContent: "flex-end",
  },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 12 },
  sheetRow: { paddingVertical: 16, paddingHorizontal: 12 },
  sheetLabel: { fontFamily: font.medium, fontSize: 16, color: colors.textPrimary },
  noteSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    gap: 14,
  },
  noteTitle: { fontFamily: font.bold, fontSize: 17, color: colors.textPrimary },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    minHeight: 90,
    fontFamily: font.regular,
    textAlignVertical: "top",
  },
});
