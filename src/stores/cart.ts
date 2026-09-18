"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Prefecture } from "@/config/shipping";
import type { Carrier } from "@/db/schema/marketplace";

/**
 * Client cart (localStorage). Holds display snapshots for instant rendering;
 * prices/stock are re-validated on the server at checkout (server/services/orders.ts#quoteCart).
 */
export type CartItem = {
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  variantLabel: string;
  farmId: string;
  farmName: string;
  imageUrl: string | null;
  unitPrice: number;
  weightGrams: number;
  quantity: number;
  maxQuantity: number;
  /* ── Optional farm shipping snapshot (client-side estimates only; server re-quotes at checkout) ── */
  farmSlug?: string;
  freeShippingThreshold?: number | null;
  leadTimeDays?: number;
  /** 0=Sun … 6=Sat */
  shipWeekdays?: number[];
  carrier?: Carrier;
};

type CartState = {
  items: CartItem[];
  add: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
};

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      add: (item, quantity = 1) =>
        set((s) => {
          const existing = s.items.find((i) => i.variantId === item.variantId);
          if (existing) {
            return { items: s.items.map((i) => (i.variantId === item.variantId ? { ...i, ...item, quantity: Math.min(i.quantity + quantity, item.maxQuantity) } : i)) };
          }
          return { items: [...s.items, { ...item, quantity: Math.min(quantity, item.maxQuantity) }] };
        }),
      setQuantity: (variantId, quantity) =>
        set((s) => ({ items: s.items.map((i) => (i.variantId === variantId ? { ...i, quantity: Math.max(1, Math.min(quantity, i.maxQuantity)) } : i)) })),
      remove: (variantId) => set((s) => ({ items: s.items.filter((i) => i.variantId !== variantId) })),
      clear: () => set({ items: [] }),
    }),
    { name: "awaji-cart-v1", storage: createJSONStorage(() => localStorage), version: 1 },
  ),
);

export const cartCount = (items: CartItem[]) => items.reduce((a, i) => a + i.quantity, 0);
export const cartSubtotal = (items: CartItem[]) => items.reduce((a, i) => a + i.unitPrice * i.quantity, 0);

/** Group items by farm (one shipment per farm). */
export function groupByFarm(items: CartItem[]) {
  const map = new Map<string, { farmId: string; farmName: string; items: CartItem[] }>();
  for (const i of items) {
    const g = map.get(i.farmId) ?? { farmId: i.farmId, farmName: i.farmName, items: [] };
    g.items.push(i);
    map.set(i.farmId, g);
  }
  return [...map.values()];
}

/* ─────────────── UI state (not persisted) ─────────────── */

/** Slide-over cart visibility. Opened by the header button and after "add to cart". */
export const useCartSheet = create<{ open: boolean; setOpen: (open: boolean) => void }>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/* ─────────────── shopper preferences (persisted) ─────────────── */

export const defaultEstimatePrefecture: Prefecture = "東京都";

/** Prefecture used for client-side shipping/delivery estimates (cart, product page). */
export const useShippingPrefs = create<{ prefecture: Prefecture; setPrefecture: (p: Prefecture) => void }>()(
  persist(
    (set) => ({
      prefecture: defaultEstimatePrefecture,
      setPrefecture: (prefecture) => set({ prefecture }),
    }),
    { name: "awaji-ship-pref-v1", storage: createJSONStorage(() => localStorage), version: 1 },
  ),
);
