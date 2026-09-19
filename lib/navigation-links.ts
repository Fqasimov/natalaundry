import { Linking, Platform } from "react-native";

/**
 * Hand a destination off to whatever maps app the courier already uses.
 *
 * Two deliberate options rather than an in-app route: couriers have a
 * preferred navigator with their own traffic settings and voice guidance, and
 * rebuilding turn-by-turn inside the app would be worse and would pull in a
 * billed directions API. These links cost nothing.
 *
 * Which one to use is a product decision, set 2026-09-04:
 *
 *   * Couriers get **Google Maps** — call openNavigation WITHOUT preferNative.
 *     It is what the drivers use here, and its traffic and address matching
 *     in Baku are better. The https://www.google.com/maps/dir/ link opens the
 *     installed app on both platforms and a browser otherwise.
 *   * Everywhere else gets the **platform's own** maps app — pass
 *     preferNative: true — so a customer is not sent out of their habits.
 */

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/**
 * The platform's own maps app. iOS has no `geo:` handler, so it gets an Apple
 * Maps URL; Android takes the standard geo: intent with a label.
 */
export function nativeMapsUrl(lat: number, lng: number, label?: string): string {
  if (Platform.OS === "ios") {
    const q = label ? `&q=${encodeURIComponent(label)}` : `&q=${lat},${lng}`;
    return `http://maps.apple.com/?daddr=${lat},${lng}${q}`;
  }
  const q = label ? `${lat},${lng}(${encodeURIComponent(label)})` : `${lat},${lng}`;
  return `geo:${lat},${lng}?q=${q}`;
}

/**
 * Open a destination, falling back to Google Maps on the web when the native
 * handler is missing — an unhandled `geo:` link fails silently otherwise, and
 * a courier tapping "navigate" and getting nothing is worse than a browser.
 */
export async function openNavigation(
  lat: number,
  lng: number,
  opts: { preferNative?: boolean; label?: string } = {}
): Promise<void> {
  const web = googleMapsUrl(lat, lng);

  if (!opts.preferNative) {
    await Linking.openURL(web);
    return;
  }

  const native = nativeMapsUrl(lat, lng, opts.label);
  try {
    if (await Linking.canOpenURL(native)) {
      await Linking.openURL(native);
      return;
    }
  } catch {
    // canOpenURL throws on web and on Android without a matching queries
    // entry; either way the web URL is the safe answer.
  }
  await Linking.openURL(web);
}

export function hasCoordinates(
  lat: number | null | undefined,
  lng: number | null | undefined
): boolean {
  return typeof lat === "number" && typeof lng === "number" && !Number.isNaN(lat) && !Number.isNaN(lng);
}
