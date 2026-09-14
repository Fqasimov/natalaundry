import { Platform } from "react-native";

// Design tokens sampled directly from the Nata Laundry screen recording
// (WhatsApp video, 2026-08-05) — the shipped 1.0.2 build. Every value here
// comes from a frame of that video rather than being invented, so screens
// rebuilt against these tokens match what users already see in the store.

export const colors = {
  // Blue hero gradient on the home screen
  heroFrom: "#3184EC",
  heroTo: "#1A6AD4",

  // Primary brand blue: steppers, active states, totals, links
  primary: "#1E77E5",
  primaryDark: "#1560C4",
  primarySoft: "#E8F1FD",

  // Orange-red: the "+" add buttons and the main commit CTAs
  // ("Götürülmə planla", "Sifarişi təsdiqlə")
  accent: "#EF4E24",
  accentDark: "#D63F18",
  accentSoft: "#FDE9E3",

  // Amber: the "Növbəti" step-forward button
  amber: "#F2B71E",
  amberDark: "#DBA20F",

  // Purple: "Hədiyyə Qutusu" banner on home
  purpleFrom: "#7C2CB6",
  purpleTo: "#67199F",

  // Near-black card used for the gift-box hero
  ink: "#18202B",

  // Warm ivory app background — the signature Nata surface
  background: "#FDFCEF",
  surface: "#FFFFFF",
  surfaceAlt: "#F1F1F4",

  textPrimary: "#14181F",
  textSecondary: "#7A828E",
  textInverse: "#FFFFFF",

  border: "#EAE8DA",
  borderStrong: "#DAD8CA",
  divider: "#EFEEE6",

  success: "#17A957",
  successSoft: "#E4F6EC",
  danger: "#E5342B",
  dangerSoft: "#FDECEA",
} as const;

// ─── Coastal palette ────────────────────────────────────────────────────────
// The five brand colours supplied as a palette sheet (Timberwolf, Alice Blue,
// Light Blue, Moonstone, Midnight Green), plus the blends needed to build
// gradients, soft fills and borders out of them.
//
// This sits *alongside* `colors` rather than replacing it: the home screen,
// the orders list and the auth flow are styled from `brand`, while the profile
// section and the checkout/catalogue screens keep the original blue/orange
// tokens sampled from the 1.0.2 recording. Near-black text (`textPrimary`,
// `ink`) is deliberately shared by both — the palette recolours surfaces and
// accents, never the black type.
export const brand = {
  // The five palette colours, verbatim from the sheet.
  timberwolf: "#D3D0C8", // RGB 211, 208, 200
  aliceBlue: "#E9F1F6", //  RGB 233, 241, 246
  lightBlue: "#B2D5E2", //  RGB 178, 213, 226
  moonstone: "#44A6B5", //  RGB  68, 166, 181
  midnight: "#004554", //   RGB   0,  69,  84

  // Hero gradient: moonstone stepped down into midnight green. The stops are
  // darker than moonstone itself because the hero carries white type at the
  // top — plain #44A6B5 under white only reaches ~2.6:1.
  heroFrom: "#1E7387",
  heroMid: "#0F6072",
  heroTo: "#004554",

  // Blends, all mixes of the five above with white.
  moonstoneDark: "#38909E", // pressed / hovered moonstone
  moonstoneSoft: "#DAEDF1", // moonstone at ~12% over white
  lightBlueSoft: "#CDE3EC", // between Light Blue and Alice Blue
  timberwolfSoft: "#E4E2DC", // Timberwolf lightened
  timberwolfDeep: "#C4C0B6", // Timberwolf darkened, for the gift band
  moonstoneInk: "#256F7D", //  Moonstone darkened until it is legible as type
  timberwolfInk: "#6E6859", // Timberwolf pushed to a legible type weight

  // Surfaces.
  //
  // NOTE: `background` and `aliceBlue` are the same colour. Anything drawn on
  // the app background must not fill itself with `aliceBlue` — it renders as
  // no card at all. Two tiles shipped that way (the ironing tile on home, the
  // signup confirmation panel) before it was caught in a screenshot. Use
  // `moonstoneSoft`, `lightBlueSoft` or `surfaceAlt` for a soft cool fill that
  // is actually visible; `aliceBlue` is fine on white or on the hero.
  background: "#E9F1F6", // Alice Blue is the app surface here, not ivory
  surface: "#FFFFFF",
  surfaceAlt: "#DCEAF1",
  border: "#CBDEE8",
  borderStrong: "#B2D5E2",
  divider: "#DFE9EF",

  // Type on the palette's own light fills (never used for the black type
  // that the rest of the app already sets in `textPrimary`).
  onSoft: "#004554",
  onSoftMuted: "#3F6B77",

  // Type and scrims on the midnight-green hero.
  onDark: "#FFFFFF",
  onDarkSoft: "rgba(255,255,255,0.86)",
  onDarkFaint: "rgba(255,255,255,0.72)",
  scrim: "rgba(255,255,255,0.16)",
  scrimStrong: "rgba(255,255,255,0.24)",
} as const;

// Each service carries its own colours through the whole app — the home cards,
// the circle selector, the hero banner and the accordion icons all key off
// this. Icons use MaterialCommunityIcons for the laundry-domain glyphs
// (washing machine, iron, shoe, purse, basket).
//
// These were the pastels sampled from 1.0.2 — periwinkle, peach, pink — and
// the home screen carried a second, coastal copy of the same map because the
// catalogue was outside the restyle at the time. Two maps meant a service
// looked like one thing on the home screen and another on its own page. The
// home screen's values won and moved here; there is one map again.
//
// `surface` is the card or banner behind the service. `iconBg`/`iconFg` are
// the circle and its glyph — deliberately not the surface, so an icon sitting
// on its own card still has contrast. `fg` is the accent for that service's
// own type, its "Bax →" label and chevron.
//
// The palette alternates Timberwolf, Light Blue and Moonstone so that adjacent
// cards on the home grid never repeat.
export const serviceTheme = {
  dry_cleaning: {
    surface: "#B2D5E2", // lightBlue
    iconBg: "#004554", //  midnight
    iconFg: "#FFFFFF",
    fg: "#004554",
    label: "Quru Təmizləmə",
    icon: "mci:washing-machine",
  },
  ironing: {
    surface: "#DCEFF2", // moonstoneSoft
    iconBg: "#44A6B5", //  moonstone
    iconFg: "#FFFFFF",
    fg: "#004554",
    label: "Ütüləmə",
    icon: "mci:iron",
  },
  shoes: {
    surface: "#D3D0C8", // timberwolf
    iconBg: "#004554",
    iconFg: "#FFFFFF",
    fg: "#004554",
    label: "Ayaqqabı",
    icon: "mci:shoe-formal",
  },
  bedding: {
    surface: "#DCE9F0", // lightBlueSoft
    iconBg: "#44A6B5",
    iconFg: "#FFFFFF",
    fg: "#004554",
    label: "Yataq Dəsti",
    icon: "mci:bed-king-outline",
  },
  bags: {
    surface: "#E8E6E0", // timberwolfSoft
    iconBg: "#004554",
    iconFg: "#FFFFFF",
    fg: "#004554",
    label: "Aksesuarlar",
    icon: "mci:purse",
  },
  // "Toplu" is a different shape of order: no item picking up front — a
  // deposit is paid, the courier collects and counts, and the real total is
  // set afterwards. It gets the inverted circle rather than a colour of its
  // own, which sets it apart without adding a sixth hue.
  toplu: {
    surface: "#DCEFF2",
    iconBg: "#FFFFFF",
    iconFg: "#004554",
    fg: "#004554",
    label: "Toplu",
    icon: "mci:basket",
  },
} as const;

export type ServiceKey = keyof typeof serviceTheme;

/** Services priced per item, i.e. everything except the count-after-pickup flow. */
export const ITEMISED_SERVICES = [
  "dry_cleaning",
  "ironing",
  "shoes",
  "bedding",
  "bags",
] as const satisfies readonly ServiceKey[];

// Plus Jakarta Sans replaces Outfit: Outfit has no schwa glyph at all
// (ə/Ə — the most common letter in Azerbaijani) and its @expo-google-fonts
// package only carries a latin-only subset besides, so ş/ğ were missing too.
// Verified against every weight used here: Plus Jakarta Sans covers the full
// Azerbaijani alphabet (ə, ş, ğ, ı, ç, ö, ü and their capitals).
//
// Plus Jakarta Sans carries no Cyrillic, so Russian never renders in it. On
// iOS and Android that is invisible: both text engines fall back per glyph to
// the system face, and Russian comes out in SF Pro / Roboto. The browser does
// not do that — with a bare family name and nothing after it, CSS drops all
// the way to the default *serif*, which is how the Russian price list ended up
// set in Times. The stack below is what stops that; keep a real fallback on
// any family added here.
const WEB_FALLBACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const family = (name: string) =>
  Platform.OS === "web" ? `${name}, ${WEB_FALLBACK}` : name;

export const font = {
  regular: family("PlusJakartaSans_400Regular"),
  medium: family("PlusJakartaSans_500Medium"),
  semibold: family("PlusJakartaSans_600SemiBold"),
  bold: family("PlusJakartaSans_700Bold"),
  extrabold: family("PlusJakartaSans_800ExtraBold"),
} as const;

// A small type scale so headings/body/labels stay consistent instead of
// each screen picking its own size+spacing ad hoc. Spread these into a
// Text style, e.g. style={[type.h1, { color: colors.textPrimary }]}.
export const type = {
  display: { fontFamily: font.extrabold, fontSize: 34, lineHeight: 40, letterSpacing: -0.6 },
  h1: { fontFamily: font.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.3 },
  h2: { fontFamily: font.bold, fontSize: 19, lineHeight: 25, letterSpacing: -0.2 },
  h3: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: font.medium, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: font.regular, fontSize: 12.5, lineHeight: 17 },
  eyebrow: {
    fontFamily: font.semibold,
    fontSize: 11.5,
    lineHeight: 15,
    letterSpacing: 0.9,
    textTransform: "uppercase" as const,
  },
} as const;

export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;

// Manat. The app prices everything as "₼7.00".
export const CURRENCY = "₼";
export const money = (n: number) => `${CURRENCY}${Number(n).toFixed(2)}`;
