"use client";
import { useSyncExternalStore } from "react";
import { shippingPolicy } from "@/config/shipping";
import type { Carrier } from "@/db/schema/marketplace";
import { fromYmd, toYmd, type YMD } from "@/lib/dates";
import { quoteShipment, scheduleDelivery, type DeliverySchedule, type ShipmentQuote } from "@/lib/shipping";
import type { CartItem } from "@/stores/cart";

/** Farm shipping defaults used when a cart snapshot predates the optional fields. */
const FALLBACK = { leadTimeDays: 2, shipWeekdays: [1, 2, 3, 4, 5, 6], carrier: "yamato" as Carrier };

const noopSubscribe = () => () => {};
const getToday = () => toYmd(new Date());

/**
 * Today's JST date on the client, `null` during SSR/prerender.
 * (Cache Components forbids `new Date()` in server render; estimates are client-only.)
 */
export function useTodayYmd(): YMD | null {
  return useSyncExternalStore(noopSubscribe, getToday, () => null);
}

export type FarmEstimate = {
  subtotal: number;
  weightGrams: number;
  quote: ShipmentQuote;
  schedule: DeliverySchedule | null;
  threshold: number | null;
  /** 0..1 progress toward free shipping (1 when free or no threshold) */
  freeProgress: number;
  remainingForFree: number;
};

export function estimateShipment(input: {
  subtotal: number;
  weightGrams: number;
  prefecture: string;
  today: YMD | null;
  leadTimeDays?: number;
  shipWeekdays?: number[];
  carrier?: Carrier;
  freeShippingThreshold?: number | null;
}): FarmEstimate {
  const threshold = input.freeShippingThreshold ?? shippingPolicy.defaultFreeShippingThreshold;
  const quote = quoteShipment({
    prefecture: input.prefecture,
    carrier: input.carrier ?? FALLBACK.carrier,
    productWeightGrams: Math.max(1, input.weightGrams),
    subtotal: input.subtotal,
    freeShippingThreshold: threshold,
  });
  const schedule = input.today
    ? scheduleDelivery({
        now: fromYmd(input.today),
        leadTimeDays: input.leadTimeDays ?? FALLBACK.leadTimeDays,
        shipWeekdays: input.shipWeekdays?.length ? input.shipWeekdays : FALLBACK.shipWeekdays,
        transitDays: quote.transitDays,
        windowDays: shippingPolicy.desiredDateWindowDays,
      })
    : null;
  const remainingForFree = threshold != null ? Math.max(0, threshold - input.subtotal) : 0;
  return {
    subtotal: input.subtotal,
    weightGrams: input.weightGrams,
    quote,
    schedule,
    threshold,
    freeProgress: threshold ? Math.min(1, input.subtotal / threshold) : 1,
    remainingForFree,
  };
}

/** Estimate for one farm group of the cart (one shipment). */
export function estimateFarmGroup(items: CartItem[], prefecture: string, today: YMD | null): FarmEstimate {
  const head = items[0];
  return estimateShipment({
    subtotal: items.reduce((a, i) => a + i.unitPrice * i.quantity, 0),
    weightGrams: items.reduce((a, i) => a + i.weightGrams * i.quantity, 0),
    prefecture,
    today,
    leadTimeDays: head?.leadTimeDays,
    shipWeekdays: head?.shipWeekdays,
    carrier: head?.carrier,
    freeShippingThreshold: head?.freeShippingThreshold,
  });
}
