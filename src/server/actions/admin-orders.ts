"use server";
import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { farmOrderStatusMeta } from "@/config/status";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { formatYen } from "@/lib/format";
import { adminTransitionSchema, refundSchema } from "@/lib/validators/admin";
import { assertRole } from "@/server/auth/guards";
import { transitionFarmOrder } from "@/server/services/orders";
import { refundOrder as refundOrderService } from "@/server/services/refunds";
import { recordAudit } from "@/server/services/audit";
import { parseInput, runAction, type ActionResult } from "./_utils";

/** Admin status change. Validation of allowed transitions lives in the service (config/status.ts). */
export async function adminTransitionFarmOrder(input: {
  farmOrderId: string;
  to: string;
  trackingNumber?: string;
  carrier?: string;
  note?: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const me = await assertRole("admin");
    const data = parseInput(adminTransitionSchema, input);
    const fo = await transitionFarmOrder(data.farmOrderId, data.to, {
      source: "admin",
      now: new Date(),
      trackingNumber: data.trackingNumber || undefined,
      carrier: data.carrier,
      note: data.note || undefined,
    });
    await recordAudit(me, {
      action: "order.status", target: { type: "farm_order", id: fo.id },
      summary: `受注 ${fo.code} を「${farmOrderStatusMeta[data.to].label}」に変更`,
      detail: { to: data.to, trackingNumber: data.trackingNumber || null, note: data.note || null },
    });
    refresh();
  }, "ステータスを更新しました");
}

/** Refund a whole order or one farm order. Domain logic: services/refunds.ts */
export async function refundOrder(input: { orderId: string; farmOrderId?: string }): Promise<ActionResult<{ amount: number; demo: boolean }>> {
  return runAction(async () => {
    const me = await assertRole("admin");
    const data = parseInput(refundSchema, input);
    const result = await refundOrderService(data);
    const order = await db.query.orders.findFirst({ where: eq(orders.id, data.orderId), columns: { code: true } });
    await recordAudit(me, {
      action: "order.refund", target: data.farmOrderId ? { type: "farm_order", id: data.farmOrderId } : { type: "order", id: data.orderId },
      summary: `注文 ${order?.code ?? data.orderId} を ${formatYen(result.amount)} 返金${data.farmOrderId ? "（出荷単位）" : ""}`,
      detail: { orderId: data.orderId, farmOrderId: data.farmOrderId ?? null, amount: result.amount, demo: result.demo },
    });
    refresh();
    return result;
  }, "返金処理が完了しました");
}
