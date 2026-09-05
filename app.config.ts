import type { ExpoConfig } from "expo/config";

/*
 * The EAS project this app publishes updates to.
 *
 * Hardcoded, and NOT read from .env. This was briefly the other way round and
 * it was wrong: .env is gitignored, so it is never uploaded to EAS Build, and
 * a cloud build would have evaluated this file with the variable unset,
 * silently producing a binary with no `updates` block and no way to ever
 * receive one. The failure would only have shown up as "OTA does nothing"
 * weeks later.
 *
 * It is not a secret either. The id is the update URL, and that URL ships
 * inside every binary — anyone can read it out of the app. Treating it as a
 * credential bought nothing and cost the build.
 *
 * `eas init` cannot write it here itself (it does not edit dynamic configs),
 * which is why it is pasted in by hand. The env var still overrides, for a
 * fork or a second Expo project built from the same source.
 *
 * Note `||`, not `??`. .env.example ships `EAS_PROJECT_ID=` with no value, so
 * anyone copying it to .env gets an empty STRING, which `??` happily accepts —
 * the config then has an empty id, drops `updates`, and builds without OTA.
 * An empty value has to mean "unset" here.
 */
const easProjectId =
  process.env.EAS_PROJECT_ID?.trim() || "6f4481f3-89a1-45f6-8465-7b0f584087fc";

// Values recovered from the original App Store build (Info.plist / Expo.plist)
// of Nata Laundry. Secrets (Supabase anon key, Google Maps key) are read from
// env vars — see .env.example — never hardcode them here.
const config: ExpoConfig = {
  name: "Nata Laundry",
  slug: "nata-laundry",
  scheme: "natalaundry",
  // 1.1.0, not 1.0.4: this release changes what an order costs (express now
  // doubles the total), removes two delivery options and moves to a new SDK.
  // A customer comparing prices with the last version should see a different
  // minor, and a crash report should not be ambiguous about which build it is.
  version: "1.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/images/icon.png",
  // The legacy top-level `splash` key was removed in SDK 57. The same image,
  // fit and background now live solely in the expo-splash-screen plugin below.
  assetBundlePatterns: ["**/*"],
  ios: {
    bundleIdentifier: "az.natalaundry.app",
    supportsTablet: false,
    // Copied verbatim from the recovered build's Info.plist so App Store
    // review notes / permission prompts match what's already approved.
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSCameraUsageDescription:
        "Nata Laundry needs camera access so you can take photos of your clothing items to document pre-existing defects.",
      NSPhotoLibraryUsageDescription:
        "Nata Laundry needs photo library access so you can select photos of your clothing items to document pre-existing defects.",
      NSLocationWhenInUseUsageDescription:
        "Nata Laundry uses your location to automatically pinpoint your address for courier pickup and delivery.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "Nata Laundry uses your location to provide accurate real-time courier tracking for your orders.",
      NSLocationAlwaysUsageDescription:
        "Nata Laundry uses your location to provide accurate real-time courier tracking for your orders.",
      NSMicrophoneUsageDescription: "Allow NataLaundry to access your microphone",
      NSFaceIDUsageDescription: "Allow NataLaundry to access your Face ID biometric data.",
    },
    /*
     * No `config.googleMapsApiKey` here — iOS renders maps with Apple Maps.
     *
     * Setting it is what tells Expo's react-native-maps plugin to wire Google
     * Maps into the iOS build, and that needs a `react-native-google-maps`
     * podspec which react-native-maps stopped shipping. 1.27.2 carries only
     * react-native-maps.podspec, so pod install failed outright:
     *
     *   [!] No podspec found for `react-native-google-maps` in
     *       node_modules/react-native-maps
     *
     * It worked on 1.20.1 under SDK 54 and broke on the SDK 57 upgrade, which
     * is why the previously shipped build was fine.
     *
     * This also matches the product decision (2026-09-04): the app uses the
     * platform's own maps, and only the courier's navigation hands off to
     * Google Maps — via a URL, which needs no SDK and no key. Android keeps
     * its key below because Android maps genuinely require one.
     */
  },
  android: {
    package: "az.natalaundry.app",
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
    config: {
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      },
    },
    permissions: [
      "CAMERA",
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "READ_PHONE_STATE",
    ],
  },
  plugins: [
    "expo-router",
    "expo-location",
    "expo-camera",
    "expo-image-picker",
    // SDK 57 moved these three to explicit config plugins; without them the
    // prebuild step skips their native setup and fonts/images/status bar
    // silently fall back to defaults in a dev or production build.
    "expo-font",
    "expo-image",
    "expo-status-bar",
    // Opens the Kapital Bank hosted payment page in a system auth session.
    // Deliberately not an in-app WebView: the customer types card details on
    // that page, and they should be able to see the real address bar and
    // padlock, and have their browser's autofill available.
    "expo-web-browser",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
      },
    ],
  ],
  /*
   * Over-the-air updates.
   *
   * `fingerprint` is the runtime version policy, not `appVersion`. It hashes
   * the native project — native modules, permissions, SDK version — and an
   * update is only ever served to a binary whose hash matches. That is the
   * guard that makes OTA safe to use: the SDK 54 -> 57 upgrade (RN 0.81 ->
   * 0.86) changed native code, and shipping today's JS to a binary built
   * before it would crash on launch, remotely, with no way to intervene from
   * the phone. With this policy such an update simply is not offered, and
   * those devices wait for a store build instead.
   *
   * So the division stands: pricing rules, screens, copy, i18n and business
   * logic go OTA; anything native needs a new build through the store.
   *
   * checkAutomatically is left at its default (on load) and the fallback
   * timeout is 0, so a cold start never blocks on the network — the update is
   * fetched in the background and applied on the next launch.
   */
  runtimeVersion: { policy: "fingerprint" },
  experiments: {
    typedRoutes: true,
  },
  extra: {
    router: {
      origin: false,
    },
  },
};

if (easProjectId) {
  config.updates = {
    url: `https://u.expo.dev/${easProjectId}`,
    fallbackToCacheTimeout: 0,
  };
  config.extra = { ...config.extra, eas: { projectId: easProjectId } };
}

export default config;
