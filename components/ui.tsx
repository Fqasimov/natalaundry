import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  type ViewStyle,
  type StyleProp,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { AppIcon, type IconName } from "@/components/AppIcon";
import { brand, colors, font, radius } from "@/theme/tokens";

/**
 * Back chevron + centred bold title + optional right-hand text action.
 *
 * router.back() is a silent no-op when the stack is empty — which happens on
 * a deep link, a reload, or after a router.replace — so the button appears
 * dead. `backFallback` gives it somewhere to go in that case.
 */
export function ScreenHeader({
  title,
  rightLabel,
  onRightPress,
  onBack,
  backFallback = "/(tabs)",
}: {
  title: string;
  rightLabel?: string;
  onRightPress?: () => void;
  onBack?: () => void;
  backFallback?: Href;
}) {
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(backFallback);
  };
  return (
    <View style={s.header}>
      <Pressable
        hitSlop={12}
        onPress={onBack ?? goBack}
        style={s.headerSide}
      >
        <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
      </Pressable>
      <Text style={s.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <Pressable hitSlop={12} onPress={onRightPress} style={s.headerSideRight}>
        {rightLabel ? (
          <Text style={s.headerRightLabel} numberOfLines={1}>
            {rightLabel}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

export function Card({
  children,
  style,
  selected,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  selected?: boolean;
}) {
  return (
    <View style={[s.card, selected && s.cardSelected, style]}>{children}</View>
  );
}

/** Orange-red circular "+" used on every catalogue row. */
export function AddButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={s.addButton} onPress={onPress} hitSlop={6}>
      <Ionicons name="add" size={22} color={colors.textInverse} />
    </Pressable>
  );
}

/**
 * Pill stepper that replaces the "+" once an item is in the basket.
 *
 * Defaults to the 1.0.2 blue. `tone="brand"` gives the coastal moonstone used
 * on screens that have been restyled — the "+" itself stays orange either way,
 * because add and adjust are different actions and only one of them commits.
 */
export function Stepper({
  value,
  onChange,
  tone = "primary",
}: {
  value: number;
  onChange: (next: number) => void;
  tone?: "primary" | "brand";
}) {
  const bg = tone === "brand" ? brand.moonstoneInk : colors.primary;
  return (
    <View style={[s.stepper, { backgroundColor: bg }]}>
      <Pressable hitSlop={6} onPress={() => onChange(value - 1)} style={s.stepperBtn}>
        <Ionicons name="remove" size={18} color={colors.textInverse} />
      </Pressable>
      <Text style={s.stepperValue}>{value}</Text>
      <Pressable hitSlop={6} onPress={() => onChange(value + 1)} style={s.stepperBtn}>
        <Ionicons name="add" size={18} color={colors.textInverse} />
      </Pressable>
    </View>
  );
}

// "brand" is the coastal-palette tone used by the auth flow; the other three
// stay exactly as sampled from the 1.0.2 recording so the catalogue, checkout
// and profile screens are untouched by the restyle.
type ButtonTone = "accent" | "amber" | "primary" | "brand";

export function BigButton({
  label,
  onPress,
  tone = "accent",
  disabled,
  loading,
  iconRight,
  style,
}: {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  loading?: boolean;
  iconRight?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}) {
  const bg =
    tone === "brand"
      ? brand.midnight
      : tone === "amber"
        ? colors.amber
        : tone === "primary"
          ? colors.primary
          : colors.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[s.bigButton, { backgroundColor: bg }, (disabled || loading) && s.disabled, style]}
    >
      {loading ? (
        <ActivityIndicator color={colors.textInverse} />
      ) : (
        <View style={s.bigButtonInner}>
          <Text style={s.bigButtonLabel} numberOfLines={2}>
            {label}
          </Text>
          {iconRight ? (
            <Ionicons name={iconRight} size={18} color={colors.textInverse} />
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

export function Pill({
  label,
  tone = "info",
}: {
  label: string;
  tone?: "info" | "primary" | "danger" | "success" | "muted" | "brand";
}) {
  const map = {
    info: { bg: colors.primarySoft, fg: colors.primary },
    primary: { bg: colors.primary, fg: colors.textInverse },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    success: { bg: colors.successSoft, fg: colors.success },
    muted: { bg: colors.surfaceAlt, fg: colors.textSecondary },
    brand: { bg: brand.moonstoneInk, fg: colors.textInverse },
  }[tone];
  return (
    <View style={[s.pill, { backgroundColor: map.bg }]}>
      <Text style={[s.pillLabel, { color: map.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Soft tinted circle holding a service or category glyph. */
export function IconBubble({
  name,
  tint,
  fg,
  size = 44,
  selected,
  ring,
}: {
  name: IconName;
  tint: string;
  fg: string;
  size?: number;
  selected?: boolean;
  /**
   * Colour of the selected ring. Defaults to `fg`, which is right when the
   * glyph sits on a pale tint — but the catalogue's bubbles are dark circles
   * with a *white* glyph, so `fg` drew a white ring on a white-ish page and
   * the selected service was indistinguishable from the rest. Callers whose
   * `fg` is not a contrasting colour must pass one.
   */
  ring?: string;
}) {
  // Drawn outside the circle rather than as a border: a border eats into the
  // 56pt bubble, so the selected one rendered visibly smaller than its
  // neighbours and the row jittered as the selection moved.
  const gap = 3;
  const stroke = 2.5;

  return (
    <View style={{ padding: gap + stroke }}>
      {selected ? (
        <View
          style={[
            s.bubbleRing,
            {
              borderRadius: (size + (gap + stroke) * 2) / 2,
              borderWidth: stroke,
              borderColor: ring ?? fg,
            },
          ]}
        />
      ) : null}
      <View
        style={[
          s.bubble,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: tint,
          },
        ]}
      >
        <AppIcon name={name} size={size * 0.5} color={fg} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
  },
  // Both sides reserve 56pt so the title sits centred, but the right side is
  // allowed to grow past it: it was a hard `width`, and every right-hand label
  // longer than "Oxundu" — which is all of them in Russian and English — was
  // being drawn outside its own box.
  headerSide: { minWidth: 56, height: 44, justifyContent: "center" },
  headerSideRight: {
    minWidth: 56,
    maxWidth: "34%",
    height: 44,
    paddingLeft: 8,
    paddingRight: 4,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: font.bold,
    fontSize: 19,
    color: colors.textPrimary,
  },
  headerRightLabel: { fontFamily: font.medium, fontSize: 15, color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardSelected: { borderColor: colors.primary, backgroundColor: "#FAFCFF" },
  addButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    height: 38,
    minWidth: 104,
    justifyContent: "space-between",
  },
  stepperBtn: { padding: 4 },
  stepperValue: {
    fontFamily: font.semibold,
    color: colors.textInverse,
    fontSize: 15,
    minWidth: 22,
    textAlign: "center",
  },
  bigButton: {
    borderRadius: radius.pill,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  bigButtonInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  // flexShrink + a two-line cap: the label sits in a row beside an optional
  // icon, so without it a long label ("Запланировать забор") pushed the icon
  // out of the pill instead of wrapping inside it.
  bigButtonLabel: {
    flexShrink: 1,
    textAlign: "center",
    fontFamily: font.semibold,
    fontSize: 16,
    color: colors.textInverse,
  },
  disabled: { opacity: 0.45 },
  // Pills sit in flex rows next to headings. flexShrink:0 keeps the pill at
  // its label's size so the heading is what wraps, rather than the pill being
  // squeezed until its text spills out of the rounded background.
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexShrink: 0,
  },
  pillLabel: { fontFamily: font.semibold, fontSize: 12 },
  bubble: { alignItems: "center", justifyContent: "center" },
  bubbleRing: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
});
