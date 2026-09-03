import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Driving distance and time along real roads, from OpenRouteService.
 *
 * Straight-line distance was rejected deliberately: "1.2 km" across the bay is
 * a twenty-minute drive, and a courier planning their round needs the road
 * answer. Nothing computes that locally — it needs a routing engine with map
 * data — so this calls one.
 *
 * ORS was chosen over Google Directions and Mapbox because its free tier needs
 * no card and allows 2,000 requests a day, which is far beyond this app's
 * volume. Get a key at openrouteservice.org/dev/#/signup and put it in
 * EXPO_PUBLIC_ORS_API_KEY.
 *
 * ── On the key being public ────────────────────────────────────────────────
 *
 * EXPO_PUBLIC_* is compiled into the bundle, so this key is extractable by
 * anyone who downloads the app. That is accepted here with eyes open: the key
 * spends a free quota, holds no money and no data, and is revocable from the
 * ORS dashboard in a click. The worst case is someone burning the daily
 * allowance and distances silently disappearing — which the UI already
 * tolerates, because it treats a missing route as "don't show it" rather than
 * as an error.
 *
 * The clean home for this is an Edge Function holding the key server-side, and
 * the shape here (one call, two numbers out) moves there without touching the
 * screens. It is not there today only because Edge Function deploys are not
 * currently available.
 *
 * Results are cached: a route between two fixed points does not change, and a
 * courier's phone re-rendering a job card must not spend quota each time.
 */

const ORS_KEY = process.env.EXPO_PUBLIC_ORS_API_KEY;
const ENDPOINT = "https://api.openrouteservice.org/v2/directions/driving-car";
const CACHE_PREFIX = "route:v1:";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type Coords = { lat: number; lng: number };

export type Route = {
  /** Metres along the road. */
  distanceM: number;
  /** Seconds of driving, as ORS estimates it. */
  durationS: number;
};

export const isRoutingConfigured = () => Boolean(ORS_KEY);

/**
 * Rounded to ~11m. Two GPS fixes from the same doorstep differ in the sixth
 * decimal place, and keying the cache on raw floats would make every render a
 * cache miss.
 */
const keyFor = (from: Coords, to: Coords) =>
  `${CACHE_PREFIX}${from.lat.toFixed(4)},${from.lng.toFixed(4)}|${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;

const memory = new Map<string, Route>();

export async function fetchRoadRoute(from: Coords, to: Coords): Promise<Route | null> {
  if (!ORS_KEY) return null;

  const key = keyFor(from, to);

  const hit = memory.get(key);
  if (hit) return hit;

  try {
    const stored = await AsyncStorage.getItem(key);
    if (stored) {
      const { route, at } = JSON.parse(stored) as { route: Route; at: number };
      if (Date.now() - at < CACHE_TTL_MS) {
        memory.set(key, route);
        return route;
      }
    }
  } catch {
    // A broken cache entry is not a reason to fail; fall through and ask ORS.
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: ORS_KEY,
        "Content-Type": "application/json",
      },
      // ORS takes [longitude, latitude], which is the opposite order to every
      // other coordinate in this codebase. Getting it backwards puts Baku in
      // the Indian Ocean and returns a plausible-looking number.
      body: JSON.stringify({
        coordinates: [
          [from.lng, from.lat],
          [to.lng, to.lat],
        ],
      }),
    });

    if (!response.ok) return null;

    const body = await response.json();
    const summary = body?.routes?.[0]?.summary;
    if (typeof summary?.distance !== "number" || typeof summary?.duration !== "number") {
      return null;
    }

    const route: Route = { distanceM: summary.distance, durationS: summary.duration };
    memory.set(key, route);
    AsyncStorage.setItem(key, JSON.stringify({ route, at: Date.now() })).catch(() => {});
    return route;
  } catch {
    // Offline, rate-limited, or ORS having a bad day. The caller shows nothing.
    return null;
  }
}

/** "3.2 km" — or metres below a kilometre, where a decimal reads as false precision. */
export function formatDistance(distanceM: number): string {
  if (distanceM < 1000) return `${Math.round(distanceM / 10) * 10} m`;
  return `${(distanceM / 1000).toFixed(1)} km`;
}

/** Whole minutes, floored at one: "0 min" reads as an error. */
export function formatDuration(durationS: number): number {
  return Math.max(1, Math.round(durationS / 60));
}
