import { taxBreakdown } from "@/lib/tax";

/**
 * 領収書に載せる金額。一部の出荷単位だけ返金した注文は、お受け取りした額（支払額 − 返金額）で発行する（#4）。
 * 以前は返金後も支払時の合計のままで、実際に受け取った額と合わなかった。
 * 受け取った額が0（全額返金・未払い）なら発行しない。
 */
export type ReceiptOrder = {
  status: string;
  paidAt: Date | null;
  total: number;
  farmOrders: { refundedAt: Date | null; refundAmount: number | null }[];
};

export function receiptAmounts(order: ReceiptOrder): { paid: number; refunded: number; received: number } | null {
  if (!order.paidAt || (order.status !== "paid" && order.status !== "refunded")) return null;
  const refunded = order.farmOrders.reduce((a, f) => a + (f.refundedAt ? (f.refundAmount ?? 0) : 0), 0);
  const received = Math.max(0, order.total - refunded);
  if (received === 0) return null;
  return { paid: order.total, refunded: Math.min(refunded, order.total), received };
}

/** 領収書の税率ごとの内訳（#10）。返金した出荷単位は、その出荷単位の中で按分して差し引く（lib/tax.ts） */
export function receiptTaxLines(order: {
  farmOrders: { refundedAt: Date | null; refundAmount: number | null; shippingFee: number; discount: number; items: { lineTotal: number; taxRate: number }[] }[];
}) {
  return taxBreakdown(
    order.farmOrders.map((fo) => ({
      items: fo.items,
      shippingFee: fo.shippingFee,
      discount: fo.discount,
      refunded: fo.refundedAt ? (fo.refundAmount ?? 0) : 0,
    })),
  );
}
