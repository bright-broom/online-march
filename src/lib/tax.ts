import { taxConfig, type TaxRate } from "@/config/tax";

/**
 * 税率ごとの内訳（#10）。領収書・支払通知書で使う。端数処理は config/tax.ts。
 * - 商品は明細ごとの税率、送料は 10%
 * - クーポン割引（運営負担）は、その出荷単位の商品の金額の割合で税率ごとに按分する（送料からは引かない）
 * - 返金は、その出荷単位の（割引後の）金額の割合で税率ごとに按分する
 * どれも最後の区分に端数を寄せ、按分した合計が元の額とずれないようにする。
 */
export type TaxLine = { rate: TaxRate; amount: number; tax: number };

export type TaxableFarmOrder = {
  items: { lineTotal: number; taxRate: number }[];
  shippingFee: number;
  discount: number;
  /** 返金した額（無ければ 0） */
  refunded: number;
};

export const taxIncluded = (amount: number, rate: number) => Math.floor((amount * rate) / (100 + rate));

/** 合計を重みの割合で分ける。最後の区分に端数を寄せる */
function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, w) => a + w, 0);
  if (sum <= 0 || total === 0) return weights.map(() => 0);
  let left = total;
  return weights.map((w, i) => {
    if (i === weights.length - 1) return left;
    const share = Math.floor((total * w) / sum);
    left -= share;
    return share;
  });
}

export function taxBreakdown(farmOrders: TaxableFarmOrder[]): TaxLine[] {
  const byRate = new Map<number, number>();
  for (const fo of farmOrders) {
    const goods = new Map<number, number>();
    for (const it of fo.items) goods.set(it.taxRate, (goods.get(it.taxRate) ?? 0) + it.lineTotal);
    const goodsRates = [...goods.keys()].sort((a, b) => a - b);
    const discountShares = allocate(Math.min(fo.discount, [...goods.values()].reduce((a, v) => a + v, 0)), goodsRates.map((r) => goods.get(r)!));
    const buckets = new Map<number, number>();
    goodsRates.forEach((r, i) => buckets.set(r, goods.get(r)! - discountShares[i]));
    if (fo.shippingFee) buckets.set(taxConfig.shippingRate, (buckets.get(taxConfig.shippingRate) ?? 0) + fo.shippingFee);

    const rates = [...buckets.keys()].sort((a, b) => a - b);
    const refundShares = allocate(fo.refunded, rates.map((r) => buckets.get(r)!));
    rates.forEach((r, i) => byRate.set(r, (byRate.get(r) ?? 0) + Math.max(0, buckets.get(r)! - refundShares[i])));
  }
  return [...byRate.entries()]
    .filter(([, amount]) => amount > 0)
    .sort(([a], [b]) => a - b)
    .map(([rate, amount]) => ({ rate: rate as TaxRate, amount, tax: taxIncluded(amount, rate) }));
}
