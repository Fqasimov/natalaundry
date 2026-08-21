import type { StringKey } from "@/lib/i18n";

/**
 * Client mirror of App\Support\OrderLifecycle.
 *
 * The server is the authority — it validates every transition and rejects
 * anything this file gets wrong — but the app needs the same vocabulary to
 * render a stepper, decide which action buttons a courier sees, and know when
 * to start the GPS loop. Keep the two in sync; the ordering here is what the
 * timeline draws.
 */
export const LIFECYCLE_STATES = [
  "order_placed",
  "assigning_couriers",
  "courier_assigned",
  "courier_en_route_pickup",
  "picked_up",
  "at_laundry",
  "processing_finished",
  "courier_en_route_delivery",
  "delivered",
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number] | "cancelled";

/** Label shown in the timeline and on the active-order card. */
export const LIFECYCLE_LABEL: Record<LifecycleState, StringKey> = {
  order_placed: "stateOrderPlaced",
  assigning_couriers: "stateAssigningCouriers",
  courier_assigned: "stateCourierAssigned",
  courier_en_route_pickup: "stateEnRoutePickup",
  picked_up: "statePickedUp",
  at_laundry: "stateAtLaundry",
  processing_finished: "stateProcessingFinished",
  courier_en_route_delivery: "stateEnRouteDelivery",
  delivered: "stateDelivered",
  cancelled: "stateCancelled",
};

/** The courier streams its position only in these two states. */
export const TRACKING_STATES: readonly LifecycleState[] = [
  "courier_en_route_pickup",
  "courier_en_route_delivery",
];

export function isTracking(state: LifecycleState | null | undefined): boolean {
  return state != null && TRACKING_STATES.includes(state);
}

/** Zero-based position in the timeline, or null once cancelled. */
export function stepIndex(state: LifecycleState | null | undefined): number | null {
  if (state == null || state === "cancelled") return null;
  const i = (LIFECYCLE_STATES as readonly string[]).indexOf(state);
  return i === -1 ? null : i;
}

export function isTerminal(state: LifecycleState | null | undefined): boolean {
  return state === "delivered" || state === "cancelled";
}

/** True while the order is still live enough to show on the home screen. */
export function isActive(state: LifecycleState | null | undefined): boolean {
  return state != null && !isTerminal(state);
}

/**
 * The next state a courier can move to, and the button label for it. Returns
 * null when the courier has nothing to do in the current state (the order is
 * waiting on the laundry, or on an admin).
 */
export function courierNextStep(
  state: LifecycleState | null | undefined
): { to: LifecycleState; label: StringKey } | null {
  switch (state) {
    case "courier_assigned":
      return { to: "courier_en_route_pickup", label: "actionHeadingToPickup" };
    case "courier_en_route_pickup":
      return { to: "picked_up", label: "actionPickedUp" };
    case "picked_up":
      return { to: "at_laundry", label: "actionAtLaundry" };
    case "processing_finished":
      return { to: "courier_en_route_delivery", label: "actionHeadingToDeliver" };
    case "courier_en_route_delivery":
      return { to: "delivered", label: "actionCompleted" };
    default:
      return null;
  }
}

/**
 * Where the courier is heading in the current state: the customer's address
 * for a pickup, the laundry for a drop-off. Used for the navigation buttons.
 */
export function courierDestinationIsCustomer(state: LifecycleState | null | undefined): boolean {
  return state === "courier_en_route_pickup" || state === "courier_en_route_delivery";
}
