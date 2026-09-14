import type { ExpoConfig } from "expo/config";

// Values recovered from the original App Store build (Info.plist / Expo.plist)
// of Nata Laundry. Secrets (Supabase anon key, Google Maps key) are read from
// env vars — see .env.example — never hardcode them here.
const config: ExpoConfig = {
  name: "Nata Laundry",
  slug: "nata-laundry",
  scheme: "natalaundry",
  version: "1.0.3",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/images/icon.png",
  splash: {
    image: "./assets/images/splash.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  assetBundlePatterns: ["**/*"],

  /*
   * Over-the-air updates.
   *
   * `runtimeVersion` is the compatibility contract between a JS bundle and the
   * binary that runs it, and the **fingerprint** policy computes it from the
   * native dependencies rather than from a version string someone remembers to
   * bump. That matters here more than it sounds: adding a native module
   * (expo-clipboard, for the referral screen's Copy button) changes the
   * fingerprint, so a bundle needing it is simply never handed to a binary
   * that lacks it. With an `appVersion` policy the same update would install
   * and then crash on the first screen that touched the missing module.
   *
   * So the rule this encodes: JS-only changes ship OTA; anything that adds or
   * removes a native module ships as a build. The policy enforces it rather
   * than trusting whoever is releasing to notice.
   *
   * `url` is filled in by `eas update:configure`, which also writes
   * extra.eas.projectId — both need an EAS account, so see OTA.md.
   */
  updates: {
    fallbackToCacheTimeout: 0,
    // Never leave someone staring at a splash screen because the update
    // server is slow; fall back to the bundle already on the device.
    checkAutomatically: "ON_LOAD",
  },
  runtimeVersion: {
    policy: "fingerprint",
  },
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
    config: {
      googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
    },
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
    // Opens the Kapital Bank hosted payment page in a system auth session.
    // Deliberately not an in-app WebView: the customer types card details on
    // that page, and they should be able to see the real address bar and
    // padlock, and have their browser's autofill available.
    "expo-web-browser",
    "expo-updates",
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
  experiments: {
    typedRoutes: true,
  },
  extra: {
    router: {
      origin: false,
    },
  },
};

export default config;
