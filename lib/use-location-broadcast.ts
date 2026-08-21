import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { pushLocation } from "./tracking";
import { isTracking, type LifecycleState } from "./lifecycle";

export type BroadcastStatus = "idle" | "requesting" | "denied" | "sharing" | "error";

/**
 * Streams the courier's position while an order is en route.
 *
 * Starts and stops itself from the order's lifecycle state — the courier never
 * has to remember to switch it off, and a forgotten loop can't keep reporting
 * after delivery (the server rejects those pings too, so both ends agree).
 *
 * Uses watchPositionAsync rather than a setInterval poll: the OS already
 * coalesces GPS updates efficiently, and distanceInterval means a courier
 * stopped at a light stops generating writes.
 */
export function useLocationBroadcast({
  orderId,
  courierId,
  state,
  enabled = true,
}: {
  orderId: string | null | undefined;
  courierId: string | null | undefined;
  state: LifecycleState | null | undefined;
  enabled?: boolean;
}) {
  const [status, setStatus] = useState<BroadcastStatus>("idle");
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const subscription = useRef<Location.LocationSubscription | null>(null);
  // Held in a ref so the watcher callback always sees current values without
  // being torn down and re-subscribed on every render.
  const target = useRef({ orderId, courierId });
  target.current = { orderId, courierId };

  const stop = useCallback(() => {
    subscription.current?.remove();
    subscription.current = null;
    setStatus((prev) => (prev === "denied" || prev === "error" ? prev : "idle"));
  }, []);

  const shouldShare = Boolean(enabled && orderId && courierId && isTracking(state));

  useEffect(() => {
    let cancelled = false;

    if (!shouldShare) {
      stop();
      return;
    }

    (async () => {
      setStatus("requesting");
      const { status: permission } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;

      if (permission !== Location.PermissionStatus.GRANTED) {
        setStatus("denied");
        return;
      }

      try {
        subscription.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 5000,
            distanceInterval: 15,
          },
          (position) => {
            const { orderId: id, courierId: courier } = target.current;
            if (!id || !courier) return;
            pushLocation({
              orderId: id,
              courierId: courier,
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              heading: position.coords.heading,
              speed: position.coords.speed,
              accuracy: position.coords.accuracy,
            })
              .then(() => setLastSentAt(Date.now()))
              // A dropped ping is not worth interrupting a delivery over; the
              // next fix supersedes it a few seconds later anyway.
              .catch(() => {});
          }
        );
        if (cancelled) {
          subscription.current?.remove();
          subscription.current = null;
          return;
        }
        setStatus("sharing");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [shouldShare, stop]);

  return { status, lastSentAt, isSharing: status === "sharing" };
}
