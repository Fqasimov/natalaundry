import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { supabase } from "./supabase";

/**
 * Whether a courier is on shift, and their position while they are.
 *
 * `courier_details` already had the columns for this — `is_active`,
 * `current_lat`, `current_lng`, `last_location_update` — and nothing ever set
 * them. Dispatch had no way to know who was working, so the admin console
 * broadcast to every courier on the books whether they were on shift or asleep.
 *
 * Going offline clears the stored position as well as the flag. A stale
 * location is worse than none: it puts a courier on the dispatcher's map at a
 * street corner they left four hours ago.
 *
 * This is deliberately coarse — one fix a minute, and only when a fix moves
 * more than 250m. It answers "roughly where is this courier, and are they
 * working", not "where are they right now", which is what the per-order
 * tracking in use-location-broadcast.ts is for.
 */
const HEARTBEAT_MS = 60_000;
const HEARTBEAT_DISTANCE_M = 250;

export type AvailabilityStatus = "idle" | "requesting" | "denied" | "online" | "error";

export function useCourierAvailability(courierId: string | null | undefined) {
  const [isOnline, setIsOnline] = useState(false);
  const [status, setStatus] = useState<AvailabilityStatus>("idle");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const subscription = useRef<Location.LocationSubscription | null>(null);

  // Load the stored flag, so a courier who was online before closing the app
  // is still online when they reopen it.
  useEffect(() => {
    let cancelled = false;
    if (!courierId) return;

    (async () => {
      const { data } = await supabase
        .from("courier_details")
        .select("is_active")
        .eq("id", courierId)
        .maybeSingle();
      if (cancelled) return;
      setIsOnline(Boolean(data?.is_active));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [courierId]);

  const stopWatching = useCallback(() => {
    subscription.current?.remove();
    subscription.current = null;
  }, []);

  // The position heartbeat runs only while online.
  useEffect(() => {
    let cancelled = false;

    if (!isOnline || !courierId) {
      stopWatching();
      setStatus((prev) => (prev === "denied" || prev === "error" ? prev : "idle"));
      return;
    }

    (async () => {
      setStatus("requesting");
      const { status: permission } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;

      if (permission !== Location.PermissionStatus.GRANTED) {
        // Being on shift without location is still useful to dispatch — they
        // just cannot be placed on a map — so the flag stays on and only the
        // heartbeat is refused.
        setStatus("denied");
        return;
      }

      try {
        subscription.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: HEARTBEAT_MS,
            distanceInterval: HEARTBEAT_DISTANCE_M,
          },
          (position) => {
            supabase
              .from("courier_details")
              .update({
                current_lat: position.coords.latitude,
                current_lng: position.coords.longitude,
                last_location_update: new Date().toISOString(),
              })
              .eq("id", courierId)
              .then(undefined, () => {
                // A dropped heartbeat is not worth interrupting a shift over.
              });
          },
        );
        if (cancelled) {
          stopWatching();
          return;
        }
        setStatus("online");
      } catch {
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      stopWatching();
    };
  }, [isOnline, courierId, stopWatching]);

  const setOnline = useCallback(
    async (next: boolean) => {
      if (!courierId) return;
      setBusy(true);
      try {
        const { error } = await supabase
          .from("courier_details")
          .update(
            next
              ? { is_active: true }
              : // Clear the position on the way out, so nobody is dispatched
                // to where this courier used to be.
                {
                  is_active: false,
                  current_lat: null,
                  current_lng: null,
                  last_location_update: null,
                },
          )
          .eq("id", courierId);
        if (error) throw error;
        setIsOnline(next);
      } finally {
        setBusy(false);
      }
    },
    [courierId],
  );

  return { isOnline, setOnline, status, loading, busy };
}
