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

// Each service category carries its own tint through the whole catalogue —
// the circle selector, the hero banner and the accordion icons all key off it.
export const serviceTheme = {
  dry_cleaning: { tint: "#E7E6FB", fg: "#5B57D6", label: "Quru Təmizləmə" },
  ironing: { tint: "#FCE6CE", fg: "#E8912A", label: "Ütüləmə" },
  shoes: { tint: "#DFDCD9", fg: "#7A6A5C", label: "Ayaqqabı" },
  bedding: { tint: "#CFF0F6", fg: "#2AA5BD", label: "Yataq Dəsti" },
  bags: { tint: "#FBD2E3", fg: "#DC3D80", label: "Çanta" },
} as const;

export type ServiceKey = keyof typeof serviceTheme;

export const font = {
  regular: "Outfit_400Regular",
  medium: "Outfit_500Medium",
  semibold: "Outfit_600SemiBold",
  bold: "Outfit_700Bold",
} as const;

export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 } as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;

// Manat. The app prices everything as "₼7.00".
export const CURRENCY = "₼";
export const money = (n: number) => `${CURRENCY}${Number(n).toFixed(2)}`;
