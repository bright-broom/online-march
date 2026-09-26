import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { routes } from "@/config/nav";
import { shippingPolicy } from "@/config/shipping";
import { db } from "@/db";
import { farmOrders, farms, shipmentEvents, type FarmOrder } from "@/db/schema";
import { addDays, toYmd, type YMD } from "@/lib/dates";
import { notify } from "@/server/services/notify";
import { alertAdmins } from "@/server/services/ops-alerts";
import { transitionFarmOrder } from "@/server/services/orders";
import { fetchTrackingStatus } from "./tracking";

/**
 * 発送済みの荷物を配達完了にする判定（#25, Cron sync-tracking）。オーナーの決定（Issue #25 のコメント）:
 * 1. 業者の記録が「配達完了」→ 完了（配達の問題があっても解ける）
 * 2. 業者の記録が「届けられなかった」（持ち戻り・返送など）→ 配達の問題として生産者と運営に知らせ、自動完了を止める
 * 3. 配達の問題がある荷物は、それ以上自動では動かさない（運営が判断する）
 * 4. 業者の API が無い → お届け予定日の翌日（shippingPolicy.autoDeliveredAfterEtaDays）に完了
 * 5. API はあるが障害・輸送中のまま → お届け予定日から trackingGraceDays 日まで待つ。過ぎたら、障害なら4と同じく完了（精算を止めない）、
 *    輸送中のままなら配達の問題にする
 * お客さまの「受け取りました」（actions/account.ts#confirmReceived）は、これとは別にその場で完了にする。
 */

const DAY = 86_400_000;

/** お届け予定日。無い古い注文は発送日＋autoDeliveredAfterDays−autoDeliveredAfterEtaDays（今までと同じ日に完了する） */
function etaOf(fo: FarmOrder): YMD | null {
  if (fo.estimatedDeliveryDate) return fo.estimatedDeliveryDate as YMD;
  if (!fo.shippedAt) return null;
  return addDays(toYmd(new Date(fo.shippedAt.getTime() + shippingPolicy.autoDeliveredAfterDays * DAY)), -shippingPolicy.autoDeliveredAfterEtaDays);
}

/** 配達の問題を記録して知らせる。すでに記録済みなら何もしない（毎回知らせない） */
async function raiseIssue(fo: FarmOrder, note: string, now: Date) {
  const [flagged] = await db
    .update(farmOrders)
    .set({ deliveryIssueAt: now, deliveryIssueNote: note })
    .where(and(eq(farmOrders.id, fo.id), eq(farmOrders.status, "shipped"), isNull(farmOrders.deliveryIssueAt)))
    .returning({ id: farmOrders.id });
  if (!flagged) return false;
  await db.insert(shipmentEvents).values({ farmOrderId: fo.id, type: "exception", message: note, source: "carrier", occurredAt: now });
  const farm = await db.query.farms.findFirst({ where: eq(farms.id, fo.farmId), columns: { ownerId: true, name: true } });
  if (farm) await notify({ userId: farm.ownerId, type: "shipping", title: `${shippingPolicy.delivery.issueNotice}（${fo.code}）`, body: note, href: routes.farmer.order(fo.id) });
  await alertAdmins({ title: `${shippingPolicy.delivery.issueNotice}（${fo.code}）`, body: `${farm?.name ?? ""}｜${note}`, href: routes.admin.order(fo.orderId) });
  return true;
}

export async function syncDeliveries(now: Date) {
  const shipped = await db.select().from(farmOrders).where(eq(farmOrders.status, "shipped"));
  const today = toYmd(now);
  const out = { checked: shipped.length, delivered: 0, issues: 0, trackingErrors: 0 };
  const complete = async (fo: FarmOrder, note: string, source: "carrier" | "cron") => {
    await transitionFarmOrder(fo.id, "delivered", { source, now, note });
    out.delivered++;
  };

  for (const fo of shipped) {
    const result = fo.trackingNumber ? await fetchTrackingStatus(fo.carrier, fo.trackingNumber) : ({ kind: "unsupported" } as const);
    if (result.kind === "ok" && result.status?.status === "delivered") {
      await complete(fo, shippingPolicy.delivery.byCarrier, "carrier");
      continue;
    }
    if (result.kind === "ok" && result.status?.status === "exception") {
      if (await raiseIssue(fo, result.status.detail ? `${shippingPolicy.delivery.issueFromCarrier}（${result.status.detail}）` : shippingPolicy.delivery.issueFromCarrier, now)) out.issues++;
      continue;
    }
    if (fo.deliveryIssueAt) continue; // 運営が判断するまで動かさない
    if (result.kind === "error") out.trackingErrors++;

    const eta = etaOf(fo);
    if (!eta) continue;
    if (result.kind === "unsupported") {
      if (today >= addDays(eta, shippingPolicy.autoDeliveredAfterEtaDays)) await complete(fo, shippingPolicy.delivery.byEta, "cron");
      continue;
    }
    if (today < addDays(eta, shippingPolicy.trackingGraceDays)) continue;
    if (result.kind === "error") await complete(fo, shippingPolicy.delivery.byEtaAfterTrackingError, "cron");
    else if (await raiseIssue(fo, shippingPolicy.delivery.issueOverdue, now)) out.issues++;
  }
  return out;
}
