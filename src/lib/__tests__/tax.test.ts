import { describe, expect, it } from "vitest";
import { taxBreakdown, taxIncluded } from "../tax";

/**
 * 税率ごとの内訳（#10）。金額は税込。税率ごとの合計に対して1回だけ切り捨て（config/tax.ts）。
 * 割引は商品だけから、返金はその出荷単位の全体から按分し、按分した合計が元の額とずれないこと。
 */
const sum = (lines: { amount: number }[]) => lines.reduce((a, l) => a + l.amount, 0);

describe("税込額に含まれる消費税", () => {
  it("税率ごとの合計から1回だけ切り捨てる", () => {
    expect(taxIncluded(3000, 8)).toBe(222); // 222.2…
    expect(taxIncluded(800, 10)).toBe(72); // 72.7…
    expect(taxIncluded(1080, 8)).toBe(80);
  });
});

describe("税率ごとの内訳", () => {
  it("商品は明細の税率、送料は 10%", () => {
    const lines = taxBreakdown([{ items: [{ lineTotal: 2000, taxRate: 8 }, { lineTotal: 1000, taxRate: 8 }], shippingFee: 800, discount: 0, refunded: 0 }]);
    expect(lines).toEqual([
      { rate: 8, amount: 3000, tax: 222 },
      { rate: 10, amount: 800, tax: 72 },
    ]);
  });

  it("割引（運営負担のクーポン）は商品から引き、送料からは引かない", () => {
    const lines = taxBreakdown([{ items: [{ lineTotal: 3000, taxRate: 8 }], shippingFee: 800, discount: 300, refunded: 0 }]);
    expect(lines).toEqual([
      { rate: 8, amount: 2700, tax: 200 },
      { rate: 10, amount: 800, tax: 72 },
    ]);
  });

  it("8% と 10% の商品が混ざると、割引は金額の割合で分け、合計はずれない", () => {
    const fo = { items: [{ lineTotal: 2000, taxRate: 8 }, { lineTotal: 1001, taxRate: 10 }], shippingFee: 0, discount: 333, refunded: 0 };
    const lines = taxBreakdown([fo]);
    expect(sum(lines)).toBe(2000 + 1001 - 333);
    expect(lines.find((l) => l.rate === 8)!.amount).toBe(2000 - Math.floor((333 * 2000) / 3001));
  });

  it("一部返金は、その出荷単位の中で割合で差し引き、合計は「支払額 − 返金額」と一致する", () => {
    const fos = [
      { items: [{ lineTotal: 3000, taxRate: 8 }], shippingFee: 800, discount: 0, refunded: 1000 },
      { items: [{ lineTotal: 1500, taxRate: 8 }], shippingFee: 700, discount: 150, refunded: 0 },
    ];
    const lines = taxBreakdown(fos);
    expect(sum(lines)).toBe(3000 + 800 - 1000 + (1500 + 700 - 150));
    // 返金は 8% と 10% の両方から減る（送料だけ・商品だけから引かない）
    expect(lines.find((l) => l.rate === 10)!.amount).toBeLessThan(800 + 700);
  });

  it("全額返金した出荷単位は内訳に出ない", () => {
    expect(taxBreakdown([{ items: [{ lineTotal: 3000, taxRate: 8 }], shippingFee: 800, discount: 0, refunded: 3800 }])).toEqual([]);
  });

  it("送料無料なら 10% の行は出ない", () => {
    expect(taxBreakdown([{ items: [{ lineTotal: 5000, taxRate: 8 }], shippingFee: 0, discount: 0, refunded: 0 }]).map((l) => l.rate)).toEqual([8]);
  });
});
