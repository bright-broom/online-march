"use server";
import { refresh } from "next/cache";
import { adminTransitionSchema, refundSchema } from "@/lib/validators/admin";
import { assertRole } from "@/server/auth/guards";
import { transitionFarmOrder } from "@/server/services/orders";
import { refundOrder as refundOrderService } from "@/server/services/refunds";
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

/** Refund a whole order or one farm order. Domain logic: services/refunds.ts */
export async function refundOrder(input: { orderId: string; farmOrderId?: string }): Promise<ActionResult<{ amount: number; demo: boolean }>> {
  return runAction(async () => {
    await assertRole("admin");
    const data = parseInput(refundSchema, input);
    const result = await refundOrderService(data);
    refresh();
    return result;
  }, "返金処理が完了しました");
}
