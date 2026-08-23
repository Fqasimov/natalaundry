import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type PropsWithChildren,
} from "react";
import { priceOrder, type DeliveryTier } from "@/lib/pricing";

export type CartLine = {
  serviceId: string;
  itemId: string;
  name: string;
  price: number;
  quantity: number;
};

// Everything the three checkout steps collect before an order is written.
export type CheckoutDraft = {
  tier: DeliveryTier;
  pickupDay: string;
  pickupSlot: string;
  pickupHandover: string;
  deliveryDay: string;
  deliverySlot: string;
  deliveryHandover: string;
  courierNote: string;
  repeatOrder: boolean;
  address: string;
  isOutsideCity: boolean;
  promoCode: string;
  /** A won gift-box prize the customer chose to spend on this order. */
  rewardId: string | null;
  discount: number;
  photos: string[];
};

type State = { lines: CartLine[]; draft: CheckoutDraft };

const lineKey = (serviceId: string, itemId: string) => `${serviceId}:${itemId}`;

const initialDraft: CheckoutDraft = {
  tier: "standard",
  pickupDay: "",
  pickupSlot: "18:00 - 20:00",
  pickupHandover: "in_person",
  deliveryDay: "",
  deliverySlot: "18:00 - 20:00",
  deliveryHandover: "in_person",
  courierNote: "",
  repeatOrder: false,
  address: "",
  isOutsideCity: false,
  promoCode: "",
  rewardId: null,
  discount: 0,
  photos: [],
};

type Action =
  | { type: "add"; line: Omit<CartLine, "quantity"> }
  | { type: "setQty"; serviceId: string; itemId: string; quantity: number }
  | { type: "patchDraft"; patch: Partial<CheckoutDraft> }
  | { type: "reset" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "add": {
      const key = lineKey(action.line.serviceId, action.line.itemId);
      const existing = state.lines.find(
        (l) => lineKey(l.serviceId, l.itemId) === key
      );
      if (existing) {
        return {
          ...state,
          lines: state.lines.map((l) =>
            lineKey(l.serviceId, l.itemId) === key
              ? { ...l, quantity: l.quantity + 1 }
              : l
          ),
        };
      }
      return { ...state, lines: [...state.lines, { ...action.line, quantity: 1 }] };
    }
    case "setQty": {
      const key = lineKey(action.serviceId, action.itemId);
      if (action.quantity <= 0) {
        return {
          ...state,
          lines: state.lines.filter((l) => lineKey(l.serviceId, l.itemId) !== key),
        };
      }
      return {
        ...state,
        lines: state.lines.map((l) =>
          lineKey(l.serviceId, l.itemId) === key
            ? { ...l, quantity: action.quantity }
            : l
        ),
      };
    }
    case "patchDraft":
      return { ...state, draft: { ...state.draft, ...action.patch } };
    case "reset":
      return { lines: [], draft: initialDraft };
  }
}

type CartContextValue = {
  lines: CartLine[];
  draft: CheckoutDraft;
  count: number;
  subtotal: number;
  breakdown: ReturnType<typeof priceOrder>;
  quantityOf: (serviceId: string, itemId: string) => number;
  add: (line: Omit<CartLine, "quantity">) => void;
  setQty: (serviceId: string, itemId: string, quantity: number) => void;
  patchDraft: (patch: Partial<CheckoutDraft>) => void;
  reset: () => void;
};

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(reducer, { lines: [], draft: initialDraft });

  const subtotal = useMemo(
    () => state.lines.reduce((sum, l) => sum + l.price * l.quantity, 0),
    [state.lines]
  );

  const count = useMemo(
    () => state.lines.reduce((sum, l) => sum + l.quantity, 0),
    [state.lines]
  );

  const breakdown = useMemo(
    () =>
      priceOrder({
        subtotal,
        tier: state.draft.tier,
        isOutsideCity: state.draft.isOutsideCity,
        discount: state.draft.discount,
      }),
    [subtotal, state.draft.tier, state.draft.isOutsideCity, state.draft.discount]
  );

  const quantityOf = useCallback(
    (serviceId: string, itemId: string) =>
      state.lines.find((l) => l.serviceId === serviceId && l.itemId === itemId)
        ?.quantity ?? 0,
    [state.lines]
  );

  const value = useMemo<CartContextValue>(
    () => ({
      lines: state.lines,
      draft: state.draft,
      count,
      subtotal,
      breakdown,
      quantityOf,
      add: (line) => dispatch({ type: "add", line }),
      setQty: (serviceId, itemId, quantity) =>
        dispatch({ type: "setQty", serviceId, itemId, quantity }),
      patchDraft: (patch) => dispatch({ type: "patchDraft", patch }),
      reset: () => dispatch({ type: "reset" }),
    }),
    [state.lines, state.draft, count, subtotal, breakdown, quantityOf]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
