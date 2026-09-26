/**
 * 消費税（#10）。オーナーの決定（Issue #10 のコメント, 2026-09-26）:
 * - 運営は適格請求書発行事業者（登録済み／予定）。登録番号は src/config/site.ts#company.invoiceRegistrationNumber。
 *   空の間は領収書・支払通知書に番号を出さない（税率ごとの内訳は出す）
 * - 商品は食品なので 8%（軽減税率）。食品以外を扱うときは商品ごとに 10% にできる。送料と販売手数料は 10%
 * 端数処理（実装で決めた。税理士の確認前提）: 金額はすべて税込。税率ごとの合計に対して1回だけ、
 * 消費税額 = 切り捨て(税込額 × 税率 ÷ (100 + 税率))。
 */
export const taxRates = { reduced: 8, standard: 10 } as const;
export type TaxRate = (typeof taxRates)[keyof typeof taxRates];

export const taxConfig = {
  /** 商品の既定（食品） */
  defaultProductRate: taxRates.reduced as TaxRate,
  shippingRate: taxRates.standard as TaxRate,
  commissionRate: taxRates.standard as TaxRate,
  productRateOptions: [
    { value: taxRates.reduced, label: "8%（食品・軽減税率）" },
    { value: taxRates.standard, label: "10%（食品以外）" },
  ],
  /** 軽減税率の対象の印（明細の商品名の後ろ） */
  reducedMark: "※",
  reducedNote: "※は軽減税率（8%）対象",
} as const;

/** 登録番号の形: T＋13桁の数字 */
export const invoiceRegistrationNumberPattern = /^T\d{13}$/;
