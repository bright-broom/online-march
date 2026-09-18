"use server";
import { and, eq } from "drizzle-orm";
import { routes } from "@/config/nav";
import { db } from "@/db";
import { farmOrders, farms, messages, orders } from "@/db/schema";
import { messageSchema } from "@/lib/validators/engagement";
import { assertUser } from "@/server/auth/guards";
import { notify } from "@/server/services/notify";
import { ActionError, parseInput, runAction, type ActionResult } from "./_utils";

/**
 * Send a message in a farm⇄customer thread.
 * - customer: customerId = self
 * - farmer:   must own farmId; customerId required
 */
export async function sendMessage(input: { farmId: string; customerId?: string; farmOrderId?: string; body: string }): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const me = await assertUser();
    const data = parseInput(messageSchema, input);
    const farm = await db.query.farms.findFirst({ where: eq(farms.id, data.farmId) });
    if (!farm) throw new ActionError("生産者が見つかりません");
    let customerId: string;
    if (me.role === "farmer" && farm.ownerId === me.id) {
      if (!data.customerId) throw new ActionError("宛先がありません");
      const [hasOrder] = await db
        .select({ id: farmOrders.id })
        .from(farmOrders)
        .innerJoin(orders, eq(orders.id, farmOrders.orderId))
        .where(and(eq(farmOrders.farmId, farm.id), eq(orders.userId, data.customerId)))
        .limit(1);
      const hasThread = hasOrder ? true : await db.query.messages.findFirst({ where: and(eq(messages.farmId, farm.id), eq(messages.customerId, data.customerId)) });
      if (!hasThread) throw new ActionError("ご注文またはメッセージのあるお客さまにのみ送信できます");
      customerId = data.customerId;
    } else if (me.role === "customer" || me.role === "admin") {
      customerId = me.id;
    } else {
      throw new ActionError("このスレッドには送信できません");
    }
    const [row] = await db.insert(messages).values({ farmId: farm.id, customerId, senderId: me.id, farmOrderId: data.farmOrderId, body: data.body }).returning({ id: messages.id });
    const toFarmer = me.id === customerId;
    await notify({
      userId: toFarmer ? farm.ownerId : customerId,
      type: "message",
      title: toFarmer ? `${me.name}さんからメッセージ` : `${farm.name}から返信が届きました`,
      body: data.body.slice(0, 80),
      href: toFarmer ? `${routes.farmer.messages}?c=${customerId}` : `${routes.mypage.messages}?f=${farm.id}`,
    });
    return { id: row.id };
  });
}
