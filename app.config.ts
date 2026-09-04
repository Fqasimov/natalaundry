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
