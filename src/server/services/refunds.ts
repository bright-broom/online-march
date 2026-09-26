import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { routes } from "@/config/nav";
import { db } from "@/db";
import { farmOrders, orders, shipmentEvents, type FarmOrder } from "@/db/schema";
import { tags } from "@/lib/cache-tags";
import { features } from "@/lib/env";
import { formatYen } from "@/lib/format";
import { ActionError } from "@/server/actions/_utils";
import { expireTags } from "@/server/cache";
import { emailTemplates } from "./email/templates";
import { notify } from "./notify";
import { transitionFarmOrder } from "./orders";

export const refundableAmountOf = (fo: FarmOrder) => Math.max(0, fo.subtotal + fo.shippingFee - fo.discount);
export const isRefunded = (fo: FarmOrder) => fo.status === "refunded" || fo.refundedAt != null;

/** Who is refunding, for the timeline and the customer's notice. Authorization is the caller's job. */
export type RefundActor = { source: "admin" | "farmer" | "customer"; note?: string };
const byAdmin: RefundActor = { source: "admin", note: "運営によりキャンセルしました" };

/**
 * Refund a whole order or one farm order. The only place money goes back to a customer: admin refunds, farmer
 * cancellations of paid orders and customer cancellations all come through here, so the double-refund guard,
 * the refundedAt / refundAmount record (sales CSV, clawback) and the customer's email apply to every one of them.
 *  - Stripe: partial refund per farm order, or the remaining balance for a whole order. Demo: state only.
 *  - delivered → refunded; paid/preparing → cancelled (stock restored); shipped/unpaid are rejected.
 *  - farm_orders.refundedAt / refundAmount record the money movement; a `refund` event is added to the timeline.
 */
export async function refundOrder(data: { orderId: string; farmOrderId?: string }, actor: RefundActor = byAdmin) {
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, data.orderId),
    with: { farmOrders: true },
  });
  if (!order) throw new ActionError("注文が見つかりません");
  if (!order.paidAt) throw new ActionError("未決済の注文は返金できません");
  if (order.status === "refunded") throw new ActionError("この注文は返金済みです");

  const targets = data.farmOrderId
    ? order.farmOrders.filter((f) => f.id === data.farmOrderId)
    : order.farmOrders.filter((f) => !isRefunded(f));
  if (data.farmOrderId && !targets.length) throw new ActionError("対象の出荷単位が見つかりません");
  if (data.farmOrderId && isRefunded(targets[0])) throw new ActionError("この出荷単位は返金済みです");
  if (!targets.length) throw new ActionError("返金できる対象がありません");
  const blocked = targets.find((f) => f.status === "shipped" || f.status === "pending_payment");
  if (blocked) {
    throw new ActionError(
      blocked.status === "shipped"
        ? `${blocked.code} は配送中のため返金できません。配達完了にしてから返金してください`
        : `${blocked.code} は未決済です`,
    );
  }

  const amount = targets.reduce((a, f) => a + refundableAmountOf(f), 0);
  const viaStripe = order.paymentProvider === "stripe" && Boolean(order.stripePaymentIntentId);
  if (viaStripe && !features.stripe) throw new ActionError("Stripe が未設定のため返金できません。環境変数を確認してください");

  const now = new Date();
  // Claim the rows before touching Stripe: the checks above are reads, so two operators pressing 返金 at the
  // same moment would both get through and leave the customer with two refund notifications and two timeline
  // entries for one movement of money. Only the run that claims every target proceeds.
  const claimed = await db
    .update(farmOrders)
    .set({ refundedAt: now })
    .where(and(inArray(farmOrders.id, targets.map((f) => f.id)), isNull(farmOrders.refundedAt)))
    .returning({ id: farmOrders.id });
  const release = async () => {
    if (claimed.length) await db.update(farmOrders).set({ refundedAt: null }).where(inArray(farmOrders.id, claimed.map((c) => c.id)));
  };
  if (claimed.length !== targets.length) {
    await release();
    throw new ActionError("この注文は別の処理で返金されました");
  }

  if (viaStripe) {
    const { refundPayment } = await import("@/server/services/payments/stripe");
    try {
      // whole order: omit amount → Stripe refunds the remaining balance
      await refundPayment(order.stripePaymentIntentId!, data.farmOrderId ? amount : undefined, data.farmOrderId ? `farm-order:${data.farmOrderId}` : `order:${order.id}`);
    } catch (e) {
      await release(); // nothing moved — let the operator retry
      throw e;
    }
  }
  for (const fo of targets) {
    if (fo.status === "delivered") await transitionFarmOrder(fo.id, "refunded", { source: actor.source, now });
    else if (fo.status === "paid" || fo.status === "preparing") {
      await transitionFarmOrder(fo.id, "cancelled", { source: actor.source, now, note: actor.note ?? byAdmin.note });
    }
    await db.update(farmOrders).set({ refundAmount: refundableAmountOf(fo) }).where(eq(farmOrders.id, fo.id));
    await db.insert(shipmentEvents).values({
      farmOrderId: fo.id,
      type: "refund",
      message: `${formatYen(refundableAmountOf(fo))} を返金しました`,
      source: actor.source,
      occurredAt: now,
    });
  }

  // Order becomes refunded when every farm order has been refunded / cancelled+refunded.
  const after = await db.query.farmOrders.findMany({ where: eq(farmOrders.orderId, order.id) });
  if (!data.farmOrderId || after.every((f) => isRefunded(f))) {
    await db.update(orders).set({ status: "refunded", cancelledAt: order.cancelledAt ?? now }).where(eq(orders.id, order.id));
  }

  await notify({
    userId: order.userId,
    type: "order",
    title: "返金手続きが完了しました",
    body: `${order.code}｜${formatYen(amount)}`,
    href: routes.mypage.order(order.id),
    email: emailTemplates.refunded({
      to: order.email,
      name: order.shippingAddress.recipientName,
      orderId: order.id,
      code: order.code,
      amount,
      reason: actor.source === "admin" ? null : actor.note ?? null,
      viaCard: viaStripe,
    }),
  });
  expireTags(tags.analytics, ...targets.map((f) => tags.farmAnalytics(f.farmId)));
  return { amount, demo: !viaStripe };
}

/**
 * 生産者によるキャンセル。支払い済みの出荷単位は返金まで行う（以前は在庫を戻すだけで、お客さまは引き落とされたままだった）。
 * 未決済のものは返金せずにキャンセルだけする。在庫は transitionFarmOrder が戻す。
 */
export async function cancelFarmOrderAsFarmer(input: { farmOrderId: string; farmId: string; reason: string; now: Date; actorId?: string }) {
  const fo = await db.query.farmOrders.findFirst({
    where: and(eq(farmOrders.id, input.farmOrderId), eq(farmOrders.farmId, input.farmId)),
    with: { order: true },
  });
  if (!fo) throw new ActionError("注文が見つかりません");
  if (fo.status === "cancelled") throw new ActionError("この注文はキャンセル済みです");
  const note = `生産者によるキャンセル：${input.reason}`;
  if (fo.order.paidAt && !isRefunded(fo) && (fo.status === "paid" || fo.status === "preparing")) {
    const { amount } = await refundOrder({ orderId: fo.orderId, farmOrderId: fo.id }, { source: "farmer", note });
    return { refunded: amount };
  }
  await transitionFarmOrder(fo.id, "cancelled", { source: "farmer", farmId: input.farmId, now: input.now, note, actorId: input.actorId });
  return { refunded: 0 };
}
