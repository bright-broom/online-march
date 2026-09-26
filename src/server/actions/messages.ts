"use server";
import { and, eq, gt } from "drizzle-orm";
import { routes } from "@/config/nav";
import { rateLimits } from "@/config/rate-limits";
import { db } from "@/db";
import { farmOrders, farms, messages, notifications, orders, user } from "@/db/schema";
import { messageSchema } from "@/lib/validators/engagement";
import { canFarm } from "@/config/farm-staff";
import { assertUser, farmAccessOf } from "@/server/auth/guards";
import { emailTemplates } from "@/server/services/email/templates";
import { notify } from "@/server/services/notify";
import { consumeRateLimit } from "@/server/services/rate-limit";
import { ActionError, parseInput, runAction, type ActionResult } from "./_utils";

/** 同じやり取りで続けて届いたメッセージは、この間メールしない（サイト内のお知らせは毎回） */
const MESSAGE_EMAIL_QUIET_MS = 30 * 60 * 1000;

/**
 * Send a message in a farm⇄customer thread.
 * - customer: customerId = self
 * - farm side (owner or staff with the "messages" capability, #24): customerId required.
 *   Staff are customer accounts, so a staff member writing to another farm (or to their own farm without a
 *   customerId) is treated as a customer.
 */
export async function sendMessage(input: { farmId: string; customerId?: string; farmOrderId?: string; body: string }): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const me = await assertUser();
    const data = parseInput(messageSchema, input);
    if (!(await consumeRateLimit("message", me.id))) throw new ActionError(rateLimits.message.message);
    const farm = await db.query.farms.findFirst({ where: eq(farms.id, data.farmId) });
    if (!farm) throw new ActionError("生産者が見つかりません");
    let customerId: string;
    const side = await farmAccessOf(me.id, me.role);
    const farmSide = side?.farm.id === farm.id && canFarm(side.access, "messages");
    // オーナーは常に農園側。スタッフ（購入者のアカウント）は宛先のお客さまを指定したときだけ農園側
    const asFarm = farmSide && (me.role === "farmer" || (Boolean(data.customerId) && data.customerId !== me.id));
    if (asFarm) {
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
    // The attached order must belong to this thread (this farm + this customer); an id from anywhere else
    // would later surface somebody else's order in whichever view renders the reference.
    let farmOrderId: string | undefined;
    if (data.farmOrderId) {
      const [ownThread] = await db
        .select({ id: farmOrders.id })
        .from(farmOrders)
        .innerJoin(orders, eq(orders.id, farmOrders.orderId))
        .where(and(eq(farmOrders.id, data.farmOrderId), eq(farmOrders.farmId, farm.id), eq(orders.userId, customerId)))
        .limit(1);
      if (!ownThread) throw new ActionError("この注文にひもづくメッセージは送信できません");
      farmOrderId = ownThread.id;
    }
    const [row] = await db.insert(messages).values({ farmId: farm.id, customerId, senderId: me.id, farmOrderId, body: data.body }).returning({ id: messages.id });
    const toFarmer = me.id === customerId;
    const recipientId = toFarmer ? farm.ownerId : customerId;
    const href = toFarmer ? `${routes.farmer.messages}?c=${customerId}` : `${routes.mypage.messages}?f=${farm.id}`;
    // メールは、同じやり取りで直前にお知らせしていなければ（#21）。続けて送ると1通ごとにメールが届いてしまうため
    const [recent] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, recipientId), eq(notifications.type, "message"), eq(notifications.href, href), gt(notifications.createdAt, new Date(Date.now() - MESSAGE_EMAIL_QUIET_MS))))
      .limit(1);
    const recipient = recent ? null : await db.query.user.findFirst({ where: eq(user.id, recipientId), columns: { email: true } });
    const fromName = toFarmer ? me.name : farm.name;
    await notify({
      userId: recipientId,
      type: "message",
      title: toFarmer ? `${me.name}さんからメッセージ` : `${farm.name}から返信が届きました`,
      body: data.body.slice(0, 80),
      href,
      email: recipient ? emailTemplates.messageReceived({ to: recipient.email, fromName, preview: data.body.slice(0, 60), href }) : undefined,
    });
    return { id: row.id };
  });
}
