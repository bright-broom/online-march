"use server";
import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { routes } from "@/config/nav";
import { db } from "@/db";
import { farmOrders, orders, shipmentEvents, type FarmOrder, type ShipmentEvent } from "@/db/schema";
import { tags } from "@/lib/cache-tags";
import { features } from "@/lib/env";
import { formatYen } from "@/lib/format";
import { adminTransitionSchema, REFUND_NOTE_PREFIX, refundSchema } from "@/lib/validators/admin";
import { assertRole } from "@/server/auth/guards";
import { expireTags } from "@/server/cache";
import { notify } from "@/server/services/notify";
import { transitionFarmOrder } from "@/server/services/orders";
import { ActionError, parseInput, runAction, type ActionResult } from "./_utils";

/** Admin status change. Validation of allowed transitions lives in the service (config/status.ts). */
export async function adminTransitionFarmOrder(input: {
  farmOrderId: string;
  to: string;
  trackingNumber?: string;
  carrier?: string;
  note?: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    await assertRole("admin");
    const data = parseInput(adminTransitionSchema, input);
    await transitionFarmOrder(data.farmOrderId, data.to, {
      source: "admin",
      now: new Date(),
      trackingNumber: data.trackingNumber || undefined,
      carrier: data.carrier,
      note: data.note || undefined,
    });
    refresh();
  }, "ステータスを更新しました");
}

const refundedAmountOf = (fo: FarmOrder) => Math.max(0, fo.subtotal + fo.shippingFee - fo.discount);
const isRefunded = (fo: FarmOrder & { events: ShipmentEvent[] }) =>
  fo.status === "refunded" || fo.events.some((e) => e.source === "admin" && e.message.startsWith(REFUND_NOTE_PREFIX));

/**
 * Refund a whole order or one farm order.
 *  - Stripe: `refundPayment` (full remaining, or the farm order's share). Demo: state only.
 *  - delivered → refunded, paid/preparing → cancelled (stock restored by the service); shipped is blocked.
 *  - A refund note is recorded in the farm order timeline (farm_orders has no refund column).
 */
export async function refundOrder(input: { orderId: string; farmOrderId?: string }): Promise<ActionResult<{ amount: number; demo: boolean }>> {
  return runAction(async () => {
    await assertRole("admin");
    const data = parseInput(refundSchema, input);
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, data.orderId),
      with: { farmOrders: { with: { events: true } } },
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

    const amount = targets.reduce((a, f) => a + refundedAmountOf(f), 0);
    const viaStripe = order.paymentProvider === "stripe" && Boolean(order.stripePaymentIntentId);
    if (viaStripe) {
      if (!features.stripe) throw new ActionError("Stripe が未設定のため返金できません。環境変数を確認してください");
      const { refundPayment } = await import("@/server/services/payments/stripe");
      // whole order: omit amount → Stripe refunds the remaining balance
      await refundPayment(order.stripePaymentIntentId!, data.farmOrderId ? amount : undefined);
    }

    const now = new Date();
    for (const fo of targets) {
      if (fo.status === "delivered") await transitionFarmOrder(fo.id, "refunded", { source: "admin", now });
      else if (fo.status === "paid" || fo.status === "preparing") {
        await transitionFarmOrder(fo.id, "cancelled", { source: "admin", now, note: "運営によりキャンセルしました" });
      }
      await db.insert(shipmentEvents).values({
        farmOrderId: fo.id,
        type: "note",
        message: `${REFUND_NOTE_PREFIX}（${formatYen(refundedAmountOf(fo))}）`,
        source: "admin",
        occurredAt: now,
      });
    }

    // Order becomes refunded when every farm order has been refunded / cancelled+refunded.
    const after = await db.query.farmOrders.findMany({ where: eq(farmOrders.orderId, order.id), with: { events: true } });
    if (!data.farmOrderId || after.every((f) => isRefunded(f))) {
      await db.update(orders).set({ status: "refunded", cancelledAt: order.cancelledAt ?? now }).where(eq(orders.id, order.id));
    }

    await notify({
      userId: order.userId,
      type: "order",
      title: "返金手続きが完了しました",
      body: `${order.code}｜${formatYen(amount)}`,
      href: routes.mypage.order(order.id),
    });
    expireTags(tags.analytics, ...targets.map((f) => tags.farmAnalytics(f.farmId)));
    refresh();
    return { amount, demo: !viaStripe };
  }, "返金処理が完了しました");
}
