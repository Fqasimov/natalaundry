import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

/**
 * Icons come from two families. Ionicons covers the generic UI furniture
 * (chevrons, bell, cart); MaterialCommunityIcons has the laundry-domain
 * glyphs the design actually calls for — washing machine, iron, shoe,
 * hanger, basket — which Ionicons simply doesn't have.
 *
 * Names are stored as prefixed strings ("mci:washing-machine") so plain data
 * files can carry them, while the template-literal union below still gives
 * full autocomplete and compile-time checking of every glyph name.
 */
export type IconName =
  | `ion:${keyof typeof Ionicons.glyphMap}`
  | `mci:${keyof typeof MaterialCommunityIcons.glyphMap}`;

export function AppIcon({
  name,
  size = 24,
  color,
}: {
  name: IconName;
  size?: number;
  color: string;
}) {
  if (name.startsWith("mci:")) {
    return (
      <MaterialCommunityIcons
        name={name.slice(4) as keyof typeof MaterialCommunityIcons.glyphMap}
        size={size}
        color={color}
      />
    );
  }
  return (
    <Ionicons
      name={name.slice(4) as keyof typeof Ionicons.glyphMap}
      size={size}
      color={color}
    />
  );
}
