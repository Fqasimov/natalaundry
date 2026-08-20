import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth-context";
import type { Profile } from "@/types/database";

// `profiles.role` drives which screens/actions a signed-in user sees
// (customer vs courier vs admin) — confirmed via RLS policies.
export function useProfile() {
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!session?.user.id) {
      setProfile(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    supabase
      .from("profiles")
      .select("id, role")
      .eq("id", session.user.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setProfile(null);
        } else {
          setProfile(data as Profile);
        }
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

  return { profile, isLoading };
}
