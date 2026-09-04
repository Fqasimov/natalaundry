import { useEffect, useRef } from "react";
import { Alert, Platform } from "react-native";
import { useI18n } from "@/lib/language-context";

/**
 * Failures the customer has to acknowledge, shown as the platform's own alert.
 *
 * Red text under a button is easy to miss and easy to scroll past: the screen
 * looks unchanged, the button still sits there, and the customer presses it
 * again. An alert interrupts, which is the correct weight for "the thing you
 * just asked for did not happen".
 *
 * WHICH ERRORS BELONG HERE. Action failures — a submit, a claim, a payment, a
 * save. Not screen-level load failures: when a screen has nothing to show but
 * the error, the error IS the content and popping it over a blank page leaves
 * the customer looking at nothing once they dismiss it. Those stay inline.
 *
 * react-native-web's Alert is a no-op, so the web build would silently swallow
 * every one of these — and the app is tested in a browser. Hence the fallback.
 */

function present(title: string, message: string) {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    if (typeof window !== "undefined") window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message || undefined);
}

/**
 * Title is required and comes from the caller's `t()`. No default: a hardcoded
 * one would be the only untranslated string on the screen it appears over.
 */
export function alertError(message: string, title: string) {
  present(title, message);
}

/**
 * Pop an alert whenever `message` becomes non-null.
 *
 * Screens keep their existing error state and their existing setError calls;
 * only the red <Text> goes. Repeats of the same message re-alert (the customer
 * pressed the button again and it failed again, which they need to see), but a
 * re-render carrying the identical value does not.
 */
export function useErrorAlert(message: string | null | undefined) {
  const { t } = useI18n();
  const shown = useRef<string | null>(null);
  const title = t("errorTitle");

  useEffect(() => {
    if (!message) {
      shown.current = null;
      return;
    }
    if (shown.current === message) return;
    shown.current = message;
    alertError(message, title);
  }, [message, title]);
}
