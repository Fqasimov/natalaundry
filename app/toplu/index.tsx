import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Switch, Modal, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, money, radius, serviceTheme } from "@/theme/tokens";
import { useI18n } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import { createTopluOrder } from "@/lib/orders";
import { TOPLU_DEPOSIT, TOPLU_PICKUP_WINDOW_HOURS } from "@/lib/toplu";
import { OUTSIDE_CITY_FEE } from "@/lib/pricing";
import { AppIcon } from "@/components/AppIcon";
import { BigButton, IconBubble, ScreenHeader } from "@/components/ui";

// Pickup slots are constrained to the next 24 hours, which is the promise the
// bulk service makes ("kuryer 24 saat ərzində gəlir").
const SLOTS = ["10:00 - 12:00", "12:00 - 14:00", "14:00 - 16:00", "16:00 - 18:00", "18:00 - 20:00"];

function buildWindow(todayLabel: string, tomorrowLabel: string) {
  const now = new Date();
  const options: { label: string; day: string; slot: string }[] = [];
  for (const [index, dayLabel] of [todayLabel, tomorrowLabel].entries()) {
    for (const slot of SLOTS) {
      const startHour = Number(slot.slice(0, 2));
      const start = new Date(now);
      start.setDate(start.getDate() + index);
      start.setHours(startHour, 0, 0, 0);
      // Only offer slots that are still ahead of us and inside the window.
      const hoursAway = (start.getTime() - now.getTime()) / 3_600_000;
      if (hoursAway > 0 && hoursAway <= TOPLU_PICKUP_WINDOW_HOURS) {
        options.push({ label: `${dayLabel}, ${slot}`, day: dayLabel, slot });
      }
    }
  }
  return options;
}

export default function TopluScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { session } = useAuth();
  const theme = serviceTheme.toplu;

  const windowOptions = useMemo(() => buildWindow(t("today"), t("tomorrow")), [t]);
  const [pickup, setPickup] = useState(windowOptions[0]?.label ?? "");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [isOutsideCity, setIsOutsideCity] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!session?.user.id) return;
    if (!address.trim()) {
      Alert.alert(t("deliveryAddress"));
      return;
    }
    if (!pickup) {
      Alert.alert(t("topluPickupWindow"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const order = await createTopluOrder({
        userId: session.user.id,
        deposit: TOPLU_DEPOSIT,
        collectionTime: pickup,
        // Bulk loads come back on the standard turnaround; the exact return
        // slot is agreed once the courier has counted.
        deliveryTime: pickup,
        address: address.trim(),
        addressLat: null,
        addressLng: null,
        notes: notes.trim() || null,
        isOutsideCity,
      });
      router.replace(`/order/${order.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenHeader title={t("topluTitle")} />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { backgroundColor: theme.tint }]}>
          <IconBubble name={theme.icon} tint="rgba(255,255,255,0.6)" fg={theme.fg} size={62} />
          <Text style={styles.heroTitle}>{theme.label}</Text>
          <Text style={styles.heroBody}>{t("topluIntro")}</Text>
        </View>

        <Text style={styles.sectionLabel}>{t("topluHowItWorks")}</Text>
        <View style={styles.steps}>
          <Step
            index={1}
            title={t("topluStep1Title")}
            body={t("topluStep1Body", { deposit: money(TOPLU_DEPOSIT) })}
            fg={theme.fg}
          />
          <Step index={2} title={t("topluStep2Title")} body={t("topluStep2Body")} fg={theme.fg} />
          <Step index={3} title={t("topluStep3Title")} body={t("topluStep3Body")} fg={theme.fg} />
        </View>

        <Text style={styles.section}>{t("deliveryAddress")}</Text>
        <TextInput
          style={styles.input}
          placeholder={t("addNewAddress")}
          placeholderTextColor={colors.textSecondary}
          value={address}
          onChangeText={setAddress}
        />

        <Text style={styles.section}>{t("topluPickupWindow")}</Text>
        <Pressable style={styles.selectRow} onPress={() => setPickerOpen(true)}>
          <Ionicons name="time-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.selectValue}>{pickup || "—"}</Text>
          <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
        </Pressable>

        <Text style={styles.section}>{t("addCourierNote")}</Text>
        <TextInput
          style={[styles.input, { height: 80 }]}
          placeholder={t("addCourierNote")}
          placeholderTextColor={colors.textSecondary}
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        <View style={styles.outsideRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.outsideTitle}>{t("outsideCity")}</Text>
            <Text style={styles.outsideNote}>
              {t("outsideCityNote", { fee: money(OUTSIDE_CITY_FEE) })}
            </Text>
          </View>
          <Switch
            value={isOutsideCity}
            onValueChange={setIsOutsideCity}
            trackColor={{ true: theme.fg, false: "#D8D8DE" }}
          />
        </View>

        <View style={styles.depositCard}>
          <View style={styles.depositRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.depositLabel}>{t("topluDeposit")}</Text>
              <Text style={styles.depositNote}>{t("topluDepositNote")}</Text>
            </View>
            <Text style={[styles.depositValue, { color: theme.fg }]}>{money(TOPLU_DEPOSIT)}</Text>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <BigButton
          label={t("topluConfirm", { deposit: money(TOPLU_DEPOSIT) })}
          onPress={submit}
          loading={submitting}
          disabled={!address.trim() || !pickup}
        />
      </View>

      <Modal transparent visible={pickerOpen} animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setPickerOpen(false)}>
          <View style={styles.sheet}>
            {windowOptions.length === 0 ? (
              <Text style={styles.sheetLabel}>—</Text>
            ) : (
              windowOptions.map((option) => (
                <Pressable
                  key={option.label}
                  style={styles.sheetRow}
                  onPress={() => {
                    setPickup(option.label);
                    setPickerOpen(false);
                  }}
                >
                  <Text style={styles.sheetLabel}>{option.label}</Text>
                </Pressable>
              ))
            )}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Numbered because the bulk flow genuinely is a three-step sequence. */
function Step({
  index,
  title,
  body,
  fg,
}: {
  index: number;
  title: string;
  body: string;
  fg: string;
}) {
  return (
    <View style={styles.step}>
      <View style={[styles.stepNumber, { backgroundColor: fg }]}>
        <Text style={styles.stepNumberLabel}>{index}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  hero: { borderRadius: radius.xl, padding: 22, alignItems: "center", gap: 10 },
  heroTitle: { fontFamily: font.extrabold, fontSize: 24, letterSpacing: -0.4, color: colors.textPrimary },
  heroBody: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: "center",
  },
  sectionLabel: {
    fontFamily: font.semibold,
    fontSize: 11.5,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: colors.textSecondary,
    marginTop: 26,
    marginBottom: 12,
  },
  steps: { gap: 14 },
  step: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  stepNumber: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  stepNumberLabel: { fontFamily: font.bold, fontSize: 13, color: colors.textInverse },
  stepTitle: { fontFamily: font.semibold, fontSize: 15, color: colors.textPrimary },
  stepBody: { fontFamily: font.regular, fontSize: 13.5, lineHeight: 19, color: colors.textSecondary, marginTop: 2 },
  section: { fontFamily: font.bold, fontSize: 16, color: colors.textPrimary, marginTop: 24, marginBottom: 10 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontFamily: font.regular,
    color: colors.textPrimary,
    textAlignVertical: "top",
  },
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
  },
  selectValue: { flex: 1, fontFamily: font.regular, fontSize: 15, color: colors.textPrimary },
  outsideRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 22 },
  outsideTitle: { fontFamily: font.semibold, fontSize: 15, color: colors.textPrimary },
  outsideNote: { fontFamily: font.regular, fontSize: 12.5, color: colors.textSecondary, marginTop: 3 },
  depositCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginTop: 24,
  },
  depositRow: { flexDirection: "row", alignItems: "center" },
  depositLabel: { fontFamily: font.bold, fontSize: 16, color: colors.textPrimary },
  depositNote: { fontFamily: font.regular, fontSize: 12.5, color: colors.textSecondary, marginTop: 3 },
  depositValue: { fontFamily: font.extrabold, fontSize: 24, letterSpacing: -0.4 },
  error: { fontFamily: font.regular, fontSize: 13, color: colors.danger, marginTop: 14 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.background,
  },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(15,20,28,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 12 },
  sheetRow: { paddingVertical: 16, paddingHorizontal: 12 },
  sheetLabel: { fontFamily: font.medium, fontSize: 16, color: colors.textPrimary },
});
