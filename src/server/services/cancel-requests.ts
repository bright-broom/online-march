import "server-only";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { routes } from "@/config/nav";
import { orderCancelCopy } from "@/config/order-cancel";
import { farmOrderStatusMeta } from "@/config/status";
import { db } from "@/db";
import { farmOrders, shipmentEvents, user } from "@/db/schema";
import { cancelRequestPending, customerCancelMode } from "@/lib/order-cancel";
import { ActionError } from "@/server/actions/_utils";
import { emailTemplates } from "./email/templates";
import { notify } from "./notify";
import { refundOrder } from "./refunds";

/**
 * お客さまのキャンセル（#18, config/order-cancel.ts）。
 * - cancelFarmOrderByCustomer: 生産者が準備を始める前（新規受注）の出荷単位を、お客さまが取り消す（その生産者の分を全額返金）
 * - requestCancelByCustomer: 出荷準備中の出荷単位に「キャンセルの依頼」を出す（1回だけ）。生産者のオーナーに知らせる
 * - answerCancelRequest: 生産者が承認（全額返金）かお断り（そのまま発送）で回答する
 * 返金はすべて refundOrder を通す（二重返金の防止・返金額の記録・返金メール）。状態は返金と同じ更新の中で確かめる（onlyStatus）ので、
 * 生産者が同時に「準備を始める」「発送済みにする」を押しても、どちらか片方しか通らない。
 */

async function ownFarmOrder(farmOrderId: string, userId: string) {
  const fo = await db.query.farmOrders.findFirst({ where: eq(farmOrders.id, farmOrderId), with: { order: true, farm: true } });
  if (!fo || fo.order.userId !== userId) throw new ActionError("注文が見つかりません");
  return fo;
}

export async function cancelFarmOrderByCustomer(farmOrderId: string, userId: string) {
  const fo = await ownFarmOrder(farmOrderId, userId);
  const mode = customerCancelMode(fo.order, fo);
  if (mode !== "cancel") {
    if (!fo.order.paidAt) throw new ActionError("お支払い前のご注文は、注文全体のキャンセルをご利用ください");
    if (fo.status === "preparing") throw new ActionError("出荷準備が始まっているため、キャンセルの依頼をご利用ください");
    throw new ActionError(`「${farmOrderStatusMeta[fo.status].label}」のためキャンセルできません`);
  }
  return refundOrder({ orderId: fo.orderId, farmOrderId: fo.id, onlyStatus: "paid" }, { source: "customer", note: "お客さまによるキャンセル" });
}

export async function requestCancelByCustomer(input: { farmOrderId: string; userId: string; reason: string; now: Date }) {
  const fo = await ownFarmOrder(input.farmOrderId, input.userId);
  const mode = customerCancelMode(fo.order, fo);
  if (mode === "cancel") throw new ActionError("まだ出荷準備が始まっていないため、そのままキャンセルできます");
  if (mode === "pending" || mode === "declined") throw new ActionError("キャンセルの依頼は1つのご注文につき1回だけです");
  if (mode !== "request") throw new ActionError(`「${farmOrderStatusMeta[fo.status].label}」のためキャンセルの依頼はできません`);

  // 準備中のまま・まだ依頼していない行だけを書き換える（同時に発送された・二重に押された場合はここで止まる）
  const [row] = await db
    .update(farmOrders)
    .set({ cancelRequestedAt: input.now, cancelRequestReason: input.reason })
    .where(and(eq(farmOrders.id, fo.id), eq(farmOrders.status, "preparing"), isNull(farmOrders.cancelRequestedAt), isNull(farmOrders.refundedAt)))
    .returning({ id: farmOrders.id });
  if (!row) throw new ActionError("注文の状態が変わったため依頼できませんでした。画面を再読み込みしてください");

  await db.insert(shipmentEvents).values({
    farmOrderId: fo.id, type: "note", message: `お客さまからキャンセルの依頼：${input.reason}`, source: "customer", occurredAt: input.now,
  });
  const owner = await db.query.user.findFirst({ where: eq(user.id, fo.farm.ownerId), columns: { email: true } });
  await notify({
    userId: fo.farm.ownerId,
    type: "order",
    title: orderCancelCopy.notice.requestedFarmer,
    body: fo.code,
    href: routes.farmer.order(fo.id),
    email: owner ? emailTemplates.farmerCancelRequested({ to: owner.email, farmName: fo.farm.name, farmOrderId: fo.id, code: fo.code, reason: input.reason }) : undefined,
  });
}

export async function answerCancelRequest(input: { farmOrderId: string; farmId: string; approve: boolean; reply: string | null; actorId: string; now: Date }) {
  const fo = await db.query.farmOrders.findFirst({
    where: and(eq(farmOrders.id, input.farmOrderId), eq(farmOrders.farmId, input.farmId)),
    with: { order: true, farm: true },
  });
  if (!fo) throw new ActionError("注文が見つかりません");
  if (!cancelRequestPending(fo)) throw new ActionError("回答できるキャンセルの依頼はありません");

  // 回答を先に押さえる（二重に押しても返金は1回。承認の返金が失敗したら回答を戻して、もう一度押せるようにする）
  const [claimed] = await db
    .update(farmOrders)
    .set({ cancelRequestAnswer: input.approve ? "approved" : "declined", cancelRequestAnsweredAt: input.now, cancelRequestReply: input.approve ? null : input.reply })
    .where(and(eq(farmOrders.id, fo.id), eq(farmOrders.status, "preparing"), isNotNull(farmOrders.cancelRequestedAt), isNull(farmOrders.cancelRequestAnsweredAt)))
    .returning({ id: farmOrders.id });
  if (!claimed) throw new ActionError("他の操作で回答済みです。画面を再読み込みしてください");

  if (input.approve) {
    try {
      await refundOrder({ orderId: fo.orderId, farmOrderId: fo.id, onlyStatus: "preparing" }, { source: "farmer", note: "お客さまのご依頼によりキャンセルしました" });
    } catch (e) {
      await db.update(farmOrders).set({ cancelRequestAnswer: null, cancelRequestAnsweredAt: null }).where(eq(farmOrders.id, fo.id));
      throw e;
    }
    return;
  }

  await db.insert(shipmentEvents).values({
    farmOrderId: fo.id, type: "note", message: "キャンセルの依頼をお断りしました", source: "farmer", actorId: input.actorId, occurredAt: input.now,
  });
  await notify({
    userId: fo.order.userId,
    type: "order",
    title: orderCancelCopy.notice.declinedCustomer,
    body: `${fo.farm.name}｜${fo.code}`,
    href: routes.mypage.order(fo.orderId),
    email: emailTemplates.cancelRequestDeclined({
      to: fo.order.email, name: fo.order.shippingAddress.recipientName, orderId: fo.orderId, code: fo.order.code, farmName: fo.farm.name, reply: input.reply,
    }),
  });
}
