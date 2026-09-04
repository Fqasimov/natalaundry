import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { supabase } from "@/lib/supabase";
import { fetchOfferedOrders } from "@/lib/orders";
import type { Order } from "@/types/database";

/**
 * Offered work, delivered as it happens.
 *
 * Before this, a broadcast job reached the courier only when something
 * refetched — a pull-to-refresh, or a tab mount. An admin could press
 * "Kuryerlərə göndər", the row could land correctly, and the courier would
 * see nothing until they thought to look. That is the bug this fixes.
 *
 * Three things keep the list honest, in order of how quickly they react:
 *
 *  1. Postgres changes. An INSERT into `courier_assignments` IS the offer, and
 *     an UPDATE to `orders` is how an offer stops being one — somebody else
 *     claimed it, or the admin cancelled it. Both arrive as a push.
 *  2. Coming back to the foreground. A phone asleep in a pocket drops the
 *     socket; whatever was missed is picked up on the next resume.
 *  3. A slow poll, as backstop. Realtime is not a guarantee — the socket can
 *     be down, the publication can be misconfigured, a proxy can eat the
 *     upgrade — and a courier staring at an empty screen has no way to tell
 *     "no work" from "no connection". Sixty seconds is late but never wrong.
 *
 * Realtime respects RLS: a client is only sent a change to a row it could
 * have SELECTed, so an offer to one courier is never delivered to another.
 * The filter below is a narrowing of that, not the thing enforcing it.
 *
 * Every event triggers a refetch rather than being trusted as a payload. The
 * offered list is a join across two tables with a state filter on one of them
 * (see fetchOfferedOrders), which a single row event cannot reproduce — and
 * getting that wrong shows a courier a job that is already gone.
 */
export function useCourierDispatch(courierId: string | null | undefined) {
  const [offers, setOffers] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [live, setLive] = useState(false);

  // Kept in a ref so the realtime callback and the interval never close over a
  // stale reload, and so neither is a dependency of the subscribe effect —
  // resubscribing on every render would tear the socket down repeatedly.
  const reloadRef = useRef<() => void>(() => {});

  const reload = useCallback(async () => {
    if (!courierId) {
      setOffers([]);
      setLoading(false);
      return;
    }
    try {
      setOffers(await fetchOfferedOrders(courierId));
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [courierId]);

  reloadRef.current = reload;

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!courierId) return;

    const fire = () => reloadRef.current();

    const channel = supabase
      .channel(`courier-dispatch:${courierId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "courier_assignments",
          filter: `courier_id=eq.${courierId}`,
        },
        fire,
      )
      // Unfiltered on purpose. The interesting update is an order leaving
      // `assigning_couriers` — often because a different courier won it — and
      // at that moment the row carries their courier_id, not this one's, so a
      // filter on courier_id would drop exactly the event worth hearing. RLS
      // still bounds what arrives.
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, fire)
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    const resume = AppState.addEventListener("change", (state) => {
      if (state === "active") fire();
    });

    const poll = setInterval(fire, 60_000);

    return () => {
      supabase.removeChannel(channel);
      resume.remove();
      clearInterval(poll);
    };
  }, [courierId]);

  return { offers, loading, error, live, reload };
}
