import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import type { Session } from "@supabase/supabase-js";
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
