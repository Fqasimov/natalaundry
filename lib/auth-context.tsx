import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import type { Session } from "@supabase/supabase-js";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { supabase } from "./supabase";

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    profile: { name: string; phone: string },
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  /** Finish a signup by entering the six-digit code from the e-mail. */
  verifySignupCode: (email: string, code: string) => Promise<{ error: string | null }>;
  /** Send the code again, for the one that never arrived. */
  resendSignupCode: (email: string) => Promise<{ error: string | null }>;
  /** Sign in (or sign up) with a Google account. */
  signInWithGoogle: () => Promise<{ error: string | null }>;
  /** Send a password-reset link to an address that already has an account. */
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  /** Set a new password. Requires a recovery session — see reset-password. */
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading,
      signInWithPassword: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },
      /**
       * Sign up, carrying the name and phone through.
       *
       * They go in `options.data` so the auth trigger that creates the
       * profile row has them, and are written to the profile directly when
       * the project is configured to sign the user straight in. Without this
       * every account arrived with a null name and no phone number: the app
       * could only ever say "Salam!", and a courier had no way to call the
       * customer whose door they were standing at.
       */
      signUp: async (email, password, profile) => {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name: profile.name, phone: profile.phone } },
        });
        if (error) return { error: error.message, needsConfirmation: false };

        // No session means the project requires email confirmation, so there
        // is nobody to write as yet — the metadata above carries it instead.
        if (!data.session) return { error: null, needsConfirmation: true };

        const { error: profileError } = await supabase
          .from("profiles")
          .update({ name: profile.name, phone: profile.phone })
          .eq("id", data.session.user.id);

        // A failed profile write is not worth blocking the signup over: the
        // account exists and both fields are editable in the profile screen.
        if (profileError) console.warn("profile update after signup", profileError.message);

        return { error: null, needsConfirmation: false };
      },
      /**
       * Finish the signup with the code from the e-mail.
       *
       * A code rather than a link, because a link has to leave the app to a
       * browser and come back through a deep link — which is the step that
       * breaks on a device where the mail app opens links in its own webview.
       * Typing six digits works everywhere.
       *
       * On success Supabase sets email_confirmed_at, which is what the
       * on_auth_user_confirmed trigger waits for: the profile row is created
       * at this moment and not before, so an address nobody proved they own
       * leaves nothing behind.
       */
      verifySignupCode: async (email, code) => {
        const { error } = await supabase.auth.verifyOtp({
          email,
          token: code.trim(),
          type: "signup",
        });
        return { error: error?.message ?? null };
      },
      resendSignupCode: async (email) => {
        const { error } = await supabase.auth.resend({ type: "signup", email });
        return { error: error?.message ?? null };
      },
      /**
       * Sign in with Google.
       *
       * Supabase does the OAuth dance; the app only opens the browser and
       * catches the return. `skipBrowserRedirect` is essential on a phone:
       * without it supabase-js tries to navigate the current page, which on
       * React Native is nothing at all, and the call silently does nothing.
       *
       * openAuthSessionAsync is used rather than a plain browser open because
       * it is the only thing that reliably hands control back to the app on
       * both platforms — it owns the redirect rather than hoping a deep link
       * lands.
       *
       * A Google account that has never been here before is created on the
       * spot, already verified: Google has confirmed the address, so
       * email_confirmed_at is set at insert and the profile trigger fires
       * immediately. There is no code to type.
       */
      signInWithGoogle: async () => {
        const redirectTo = makeRedirectUri({ scheme: "natalaundry", path: "auth-callback" });

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo, skipBrowserRedirect: true },
        });

        if (error) return { error: error.message };
        if (!data?.url) return { error: "google_sign_in_unavailable" };

        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

        if (result.type !== "success") {
          // Dismissed or cancelled. Not an error worth showing — the customer
          // knows they backed out.
          return { error: null };
        }

        // Supabase returns the session on the fragment, or as a code to
        // exchange when PKCE is in play. Handle both rather than assuming.
        const url = result.url;
        const fragment = url.includes("#") ? url.split("#")[1] : "";
        const params = new URLSearchParams(fragment);
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");

        if (accessToken && refreshToken) {
          const { error: setError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          return { error: setError?.message ?? null };
        }

        const code = new URL(url).searchParams.get("code");
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          return { error: exchangeError?.message ?? null };
        }

        return { error: "google_sign_in_incomplete" };
      },
      /**
       * Ask Supabase to e-mail a reset link.
       *
       * Deliberately says nothing about whether the address has an account:
       * a different answer for a known and an unknown address turns this form
       * into a way of finding out who is registered. Supabase behaves the same
       * way, and the screen tells the customer to check their mail either way.
       */
      sendPasswordReset: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: makeRedirectUri({ scheme: "natalaundry", path: "reset-password" }),
        });
        return { error: error?.message ?? null };
      },
      updatePassword: async (password) => {
        const { error } = await supabase.auth.updateUser({ password });
        return { error: error?.message ?? null };
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
