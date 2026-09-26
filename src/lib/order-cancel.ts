import type { FarmOrderStatus } from "@/db/schema";

/** お客さまが注文全体を取り消せる出荷単位の状態（出荷準備中は含まない） */
export const WHOLE_ORDER_CANCELLABLE: FarmOrderStatus[] = ["pending_payment", "paid", "cancelled"];

/**
 * お客さまが出荷単位に対してできること（#18, config/order-cancel.ts）。画面と Action が同じ判定を使う。
 * - cancel: 新規受注（生産者が準備を始める前）→ 自分で取り消せる（その生産者の分を全額返金）
 * - request: 出荷準備中・まだ依頼していない → キャンセルを依頼できる（1回だけ）
 * - pending / declined: 依頼中・お断りされた
 * 支払い前の注文は、出荷単位ではなく注文全体のキャンセル（services/orders.ts#cancelOrderByCustomer）。
 */
export type CustomerCancelMode = "cancel" | "request" | "pending" | "declined" | null;

type FarmOrderLike = {
  status: FarmOrderStatus;
  refundedAt: Date | null;
  cancelRequestedAt: Date | null;
  cancelRequestAnswer: "approved" | "declined" | null;
  cancelRequestAnsweredAt: Date | null;
};

export function customerCancelMode(order: { status: string; paidAt: Date | null }, fo: FarmOrderLike): CustomerCancelMode {
  if (order.status !== "paid" || !order.paidAt || fo.refundedAt) return null;
  if (fo.status === "paid") return "cancel";
  if (fo.status !== "preparing") return null;
  if (!fo.cancelRequestedAt) return "request";
  if (!fo.cancelRequestAnsweredAt) return "pending";
  return fo.cancelRequestAnswer === "declined" ? "declined" : null;
}

/** 生産者が回答していないキャンセルの依頼がある（回答するまで発送済みにできない） */
export const cancelRequestPending = (fo: Pick<FarmOrderLike, "status" | "cancelRequestedAt" | "cancelRequestAnsweredAt">) =>
  fo.status === "preparing" && fo.cancelRequestedAt != null && fo.cancelRequestAnsweredAt == null;
