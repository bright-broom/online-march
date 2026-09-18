/** Platform economics. Admin can override via platform_settings (see server/queries/settings.ts). */
export const feeConfig = {
  /** 販売手数料（商品代金に対して）。1000 bps = 10% */
  defaultCommissionRateBps: 1000,
  /** 送料には手数料をかけない（農家さんの実費負担分のため） */
  commissionOnShipping: false,
  /** 精算サイクル: 月末締め・翌月 payoutDay 日払い */
  payout: {
    closingDay: "month_end" as const,
    payoutDay: 15,
    minimumAmount: 1000,
    /** 繰越: 最低額未満は翌月へ */
    carryOver: true,
  },
  /** 表示用: 他社比較（LP・出店案内で使用） */
  comparison: [
    { name: "あわじ玉ねぎマルシェ", rate: "10%", highlight: true },
    { name: "一般的な産直EC", rate: "15〜20%", highlight: false },
    { name: "大手モール", rate: "10% + 月額費", highlight: false },
  ],
} as const;

export const bpsToPercent = (bps: number) => bps / 100;
export const calcCommission = (amount: number, bps: number) => Math.floor((amount * bps) / 10000);
