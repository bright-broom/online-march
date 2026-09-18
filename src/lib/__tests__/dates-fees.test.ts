import { describe, expect, it } from "vitest";
import { calcCommission } from "@/config/fees";
import { addDays, diffDays, nextAllowedDay, toYmd, weekday } from "../dates";
import { formatWeight, formatYen } from "../format";
import { orderCode } from "../ids";

describe("dates (JST)", () => {
  it("uses Asia/Tokyo calendar days", () => {
    expect(toYmd(new Date("2026-09-18T15:30:00Z"))).toBe("2026-09-19"); // 00:30 JST next day
  });
  it("adds days and computes weekday/diff", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekday("2026-09-18")).toBe(5);
    expect(diffDays("2026-10-01", "2026-09-18")).toBe(13);
    expect(nextAllowedDay("2026-09-20", [1, 2, 3, 4, 5])).toBe("2026-09-21");
  });
});

describe("fees", () => {
  it("floors commission in yen", () => {
    expect(calcCommission(2980, 1000)).toBe(298);
    expect(calcCommission(4999, 1000)).toBe(499);
    expect(calcCommission(10000, 850)).toBe(850);
  });
});

describe("format / ids", () => {
  it("formats yen and weight", () => {
    expect(formatYen(2980)).toMatch(/2,980/);
    expect(formatWeight(5000)).toBe("5kg");
    expect(formatWeight(1300)).toBe("1.3kg");
  });
  it("generates readable order codes", () => {
    expect(orderCode(new Date("2026-09-18T01:00:00Z"))).toMatch(/^AM-260918-[2-9A-HJ-NP-Z]{4}$/);
  });
});
