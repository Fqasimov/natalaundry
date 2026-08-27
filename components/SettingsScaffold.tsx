import { View, Text, StyleSheet, ScrollView, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ui";
import { brand, colors, font, radius, type } from "@/theme/tokens";

/**
 * Shared chrome for the profile sub-screens.
 *
 * They all have the same shape — a back header over a pale blue surface with
 * white cards — so the layout lives here rather than being copied six times.
 * The palette matches app/(tabs)/profile.tsx, which is where they open from.
 */
export const settingsUi = {
  bg: brand.background,
  surface: brand.surface,
  border: brand.border,
  divider: brand.divider,
  // Near-black type is shared with the rest of the app: the palette moves
  // surfaces and accents, never the black the copy is set in.
  ink: colors.textPrimary,
  inkSoft: brand.onSoftMuted,
  accent: brand.moonstoneInk,
  accentSoft: brand.moonstoneSoft,
  // Destructive stays red. It reads as an outcome, not as brand colour.
  danger: colors.danger,
} as const;

export function SettingsScaffold({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.root, { paddingTop: insets.top + 4 }]}>
      <ScreenHeader title={title} backFallback="/(tabs)/profile" />
      <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 32 }]}>
        {children}
      </ScrollView>
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Note({ children }: { children: React.ReactNode }) {
  return <Text style={s.note}>{children}</Text>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: settingsUi.bg },
  body: { paddingHorizontal: 16, paddingTop: 6, gap: 14 },
  card: {
    backgroundColor: settingsUi.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: settingsUi.border,
    overflow: "hidden",
  },
  note: {
    ...type.body,
    color: settingsUi.inkSoft,
    paddingHorizontal: 4,
  },
});

export const settingsText = StyleSheet.create({
  h1: { fontFamily: font.extrabold, fontSize: 22, letterSpacing: -0.4, color: settingsUi.ink },
  h2: { fontFamily: font.bold, fontSize: 16, color: settingsUi.ink },
  body: { ...type.body, color: settingsUi.inkSoft },
  value: { fontFamily: font.bold, fontSize: 15, color: settingsUi.ink },
  pad: { padding: 18, gap: 8 },
  radius: { borderRadius: radius.lg },
});
