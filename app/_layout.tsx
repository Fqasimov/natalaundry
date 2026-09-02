import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/lib/auth-context";
import { LanguageProvider } from "@/lib/language-context";
import { CartProvider } from "@/lib/state/cart";
import { CartFab } from "@/components/CartFab";
import { brand } from "@/theme/tokens";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  /**
   * Don't let a font hold the whole app hostage.
   *
   * `useFonts` settles to neither loaded nor errored if the asset request
   * stalls — which happens in Expo Go whenever Metro is slow or the phone
   * drops off the LAN mid-fetch. The old code returned null until it settled,
   * so that stall showed as an app frozen on the splash screen with nothing in
   * the logs to say why.
   *
   * After the grace period the app renders anyway, in the system font. Plus
   * Jakarta Sans swaps in the moment it arrives. Wrong typeface for a second
   * beats a dead launch, and the AZ glyphs (ə ş ğ ı ç ö ü) survive the
   * fallback because the system faces cover them.
   */
  const [waitedLongEnough, setWaitedLongEnough] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setWaitedLongEnough(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const ready = fontsLoaded || !!fontError || waitedLongEnough;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync().catch(() => {
        // Already hidden, or the module is unavailable. Either way the app is
        // on screen, which is the only thing this call was for.
      });
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <LanguageProvider>
          <AuthProvider>
            <CartProvider>
              <StatusBar style="dark" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  // What shows between screens during a push. Ivory here
                  // flashed against the coastal surfaces on every transition.
                  contentStyle: { backgroundColor: brand.background },
                }}
              />
              {/* Sibling of the Stack rather than inside a screen, so it is
                  not re-mounted on every navigation. It renders on the home
                  screen only — see CartFab. */}
              <CartFab />
            </CartProvider>
          </AuthProvider>
        </LanguageProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
