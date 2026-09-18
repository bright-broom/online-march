import { describe, expect, it } from "vitest";
import { packBoxes, quoteShipment, rateFor, scheduleDelivery, zoneOf } from "../shipping";

describe("zoneOf", () => {
  it("maps prefectures to zones", () => {
    expect(zoneOf("兵庫県")).toBe("kansai");
    expect(zoneOf("東京都")).toBe("kanto");
    expect(zoneOf("北海道")).toBe("hokkaido");
    expect(zoneOf("沖縄県")).toBe("okinawa");
  });
});

describe("packBoxes", () => {
  it("picks the smallest box that fits product + tare", () => {
    expect(packBoxes(1_500)).toMatchObject({ size: 60, count: 1 });
    expect(packBoxes(5_000)).toMatchObject({ size: 100, count: 1 }); // 5.4kg > 80 size limit
    expect(packBoxes(10_000)).toMatchObject({ size: 120, count: 1 });
    expect(packBoxes(20_000)).toMatchObject({ size: 160, count: 1 });
  });
  it("splits into multiple boxes over 25kg", () => {
    const r = packBoxes(40_000);
    expect(r.count).toBe(2);
    expect(r.size).toBe(160);
  });
});

describe("quoteShipment", () => {
  it("charges by zone & size and applies the free-shipping threshold", () => {
    const base = { prefecture: "東京都", carrier: "yamato" as const, productWeightGrams: 5_000 };
    const paid = quoteShipment({ ...base, subtotal: 3_000, freeShippingThreshold: 8_000 });
    expect(paid.fee).toBe(rateFor("yamato", "kanto", 100));
    expect(paid.isFree).toBe(false);
    const free = quoteShipment({ ...base, subtotal: 9_000, freeShippingThreshold: 8_000 });
    expect(free.fee).toBe(0);
    expect(free.isFree).toBe(true);
  });
  it("applies carrier factor", () => {
    expect(rateFor("japanpost", "kansai", 60)).toBeLessThan(rateFor("yamato", "kansai", 60));
  });
});

describe("scheduleDelivery", () => {
  // 2026-09-18 is a Friday (JST)
  const now = new Date("2026-09-18T10:00:00+09:00");
  const base = { now, leadTimeDays: 2, shipWeekdays: [1, 2, 3, 4, 5, 6], transitDays: 1, windowDays: 21 };

  it("rolls the earliest ship date past non-shipping weekdays", () => {
    const s = scheduleDelivery(base); // +2 = Sun 9/20 → Mon 9/21
    expect(s.earliestShipDate).toBe("2026-09-21");
    expect(s.earliestDeliveryDate).toBe("2026-09-22");
    expect(s.shipByDate).toBe("2026-09-21");
  });
  it("back-schedules ship-by from a desired date", () => {
    const s = scheduleDelivery({ ...base, desiredDate: "2026-09-28" }); // Mon; ship Sun → roll back to Sat
    expect(s.estimatedDeliveryDate).toBe("2026-09-28");
    expect(s.shipByDate).toBe("2026-09-26");
  });
  it("ignores a desired date earlier than possible", () => {
    const s = scheduleDelivery({ ...base, desiredDate: "2026-09-19" });
    expect(s.shipByDate).toBe("2026-09-21");
    expect(s.estimatedDeliveryDate).toBe("2026-09-22");
  });
});
