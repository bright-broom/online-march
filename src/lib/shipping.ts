/**
 * Pure shipping calculator — shared by the client cart (estimates) and the server
 * (authoritative quote at checkout). No I/O. See docs/SHIPPING.md.
 */
import {
  boxSizes,
  carriers,
  packagingTareGrams,
  shippingZones,
  type BoxSize,
  type ShippingZoneKey,
} from "@/config/shipping";
import type { Carrier } from "@/db/schema/marketplace";
import { addDays, diffDays, nextAllowedDay, toYmd, weekday, type YMD } from "./dates";

export function zoneOf(prefecture: string): ShippingZoneKey {
  for (const [key, zone] of Object.entries(shippingZones)) {
    if ((zone.prefectures as readonly string[]).includes(prefecture)) return key as ShippingZoneKey;
  }
  return "kanto"; // conservative fallback
}

const MAX_BOX = boxSizes[boxSizes.length - 1];

/** Split total product weight into the fewest boxes, then pick the smallest size that fits. */
export function packBoxes(productWeightGrams: number): { size: BoxSize; count: number; perBoxGrams: number } {
  const capacity = MAX_BOX.maxWeightGrams - packagingTareGrams;
  const count = Math.max(1, Math.ceil(productWeightGrams / capacity));
  const perBoxGrams = Math.ceil(productWeightGrams / count) + packagingTareGrams;
  const box = boxSizes.find((b) => b.maxWeightGrams >= perBoxGrams) ?? MAX_BOX;
  return { size: box.size, count, perBoxGrams };
}

export function rateFor(carrier: Carrier, zone: ShippingZoneKey, size: BoxSize) {
  const idx = boxSizes.findIndex((b) => b.size === size);
  const base = shippingZones[zone].rates[idx] ?? shippingZones[zone].rates.at(-1)!;
  return Math.round((base * carriers[carrier].rateFactor) / 10) * 10;
}

export type ShipmentQuote = {
  zone: ShippingZoneKey;
  zoneLabel: string;
  carrier: Carrier;
  boxSize: BoxSize;
  boxCount: number;
  totalWeightGrams: number;
  fee: number;
  isFree: boolean;
  transitDays: number;
};

export function quoteShipment(input: {
  prefecture: string;
  carrier: Carrier;
  productWeightGrams: number;
  subtotal: number;
  freeShippingThreshold?: number | null;
}): ShipmentQuote {
  const zone = zoneOf(input.prefecture);
  const { size, count, perBoxGrams } = packBoxes(input.productWeightGrams);
  const isFree = input.freeShippingThreshold != null && input.subtotal >= input.freeShippingThreshold;
  return {
    zone,
    zoneLabel: shippingZones[zone].label,
    carrier: input.carrier,
    boxSize: size,
    boxCount: count,
    totalWeightGrams: perBoxGrams * count,
    fee: isFree ? 0 : rateFor(input.carrier, zone, size) * count,
    isFree,
    transitDays: shippingZones[zone].transitDays,
  };
}

export type DeliverySchedule = {
  /** earliest date the farm can ship */
  earliestShipDate: YMD;
  earliestDeliveryDate: YMD;
  latestSelectableDate: YMD;
  shipByDate: YMD;
  estimatedDeliveryDate: YMD;
};

/**
 * Compute ship-by & delivery dates.
 * - earliest ship = today + leadTimeDays, rolled forward to an allowed ship weekday
 * - if a desired date is given (>= earliest delivery), ship-by = desired − transit, rolled back to an allowed weekday
 */
export function scheduleDelivery(input: {
  now: Date;
  leadTimeDays: number;
  shipWeekdays: readonly number[];
  transitDays: number;
  desiredDate?: YMD | null;
  windowDays: number;
}): DeliverySchedule {
  const today = toYmd(input.now);
  const earliestShipDate = nextAllowedDay(addDays(today, input.leadTimeDays), input.shipWeekdays);
  const earliestDeliveryDate = addDays(earliestShipDate, input.transitDays);
  const latestSelectableDate = addDays(earliestDeliveryDate, input.windowDays);

  let shipByDate = earliestShipDate;
  let estimatedDeliveryDate = earliestDeliveryDate;
  if (input.desiredDate && diffDays(input.desiredDate, earliestDeliveryDate) >= 0) {
    let candidate = addDays(input.desiredDate, -input.transitDays);
    for (let i = 0; i < 7 && !input.shipWeekdays.includes(weekday(candidate)); i++) {
      candidate = addDays(candidate, -1);
    }
    if (diffDays(candidate, earliestShipDate) >= 0) shipByDate = candidate;
    estimatedDeliveryDate = input.desiredDate;
  }
  return { earliestShipDate, earliestDeliveryDate, latestSelectableDate, shipByDate, estimatedDeliveryDate };
}
