"use server";
import { refresh } from "next/cache";
import { z } from "zod";
import { farmOrderStatusMeta, farmOrderTransitions } from "@/config/status";
import type { Carrier, FarmOrderStatus } from "@/db/schema";
import { bulkShipSchema, cancelOrderSchema, idsSchema, shipOrderSchema, trackingImportSchema } from "@/lib/validators/farmer";
import { assertFarm } from "@/server/auth/guards";
import { getPayoutOrders, matchOrdersByCode, type PayoutOrderRow } from "@/server/queries/farmer";
import { transitionFarmOrder } from "@/server/services/orders";
import { cancelFarmOrderAsFarmer } from "@/server/services/refunds";
import { parseTrackingCsv } from "@/server/services/shipping/label-csv";
import { ActionError, parseInput, runAction, type ActionResult } from "./_utils";

const uuidSchema = z.uuid("IDが正しくありません");

export type BulkResult = { done: number; failed: { id: string; error: string }[] };

const errMessage = (e: unknown) => (e instanceof ActionError ? e.message : "処理できませんでした");

/** 出荷準備を開始 (paid → preparing). Accepts one or many ids. */
export async function startPreparing(ids: string[]): Promise<ActionResult<BulkResult>> {
  return runAction(async () => {
    const { user, farm } = await assertFarm("ship");
    const list = parseInput(idsSchema, ids);
    const now = new Date();
    const out: BulkResult = { done: 0, failed: [] };
    for (const id of list) {
      try {
        await transitionFarmOrder(id, "preparing", { source: "farmer", farmId: farm.id, now, actorId: user.id });
        out.done++;
      } catch (e) {
        out.failed.push({ id, error: errMessage(e) });
      }
    }
    if (!out.done && out.failed.length) throw new ActionError(out.failed[0].error);
    refresh();
    return out;
  });
}

/** 発送済みにする (single) — tracking number required; the service sends the 発送メール. */
export async function shipOrder(input: { id: string; carrier: Carrier; trackingNumber: string }): Promise<ActionResult> {
  return runAction(async () => {
    const { user, farm } = await assertFarm("ship");
    const data = parseInput(shipOrderSchema, input);
    await transitionFarmOrder(data.id, "shipped", {
      source: "farmer", farmId: farm.id, now: new Date(), carrier: data.carrier, trackingNumber: data.trackingNumber, actorId: user.id,
    });
    refresh();
  }, "発送済みにしました。お客さまへ発送メールを送りました");
}

/** 追跡番号の一括登録 → each to shipped. Partial success allowed. */
export async function shipOrdersBulk(input: { rows: { id: string; carrier: Carrier; trackingNumber: string }[] }): Promise<ActionResult<BulkResult>> {
  return runAction(async () => {
    const { user, farm } = await assertFarm("ship");
    const { rows } = parseInput(bulkShipSchema, input);
    const now = new Date();
    const out: BulkResult = { done: 0, failed: [] };
    for (const r of rows) {
      try {
        await transitionFarmOrder(r.id, "shipped", { source: "farmer", farmId: farm.id, now, carrier: r.carrier, trackingNumber: r.trackingNumber, actorId: user.id });
        out.done++;
      } catch (e) {
        out.failed.push({ id: r.id, error: errMessage(e) });
      }
    }
    if (!out.done && out.failed.length) throw new ActionError(out.failed[0].error);
    refresh();
    return out;
  });
}

/** キャンセル (with reason). 支払い済みならお客さまへ返金する。在庫はサービスが戻す。 */
export async function cancelOrder(input: { id: string; reason: string }): Promise<ActionResult> {
  return runAction(async () => {
    const { user, farm } = await assertFarm("cancel");
    const data = parseInput(cancelOrderSchema, input);
    await cancelFarmOrderAsFarmer({ farmOrderId: data.id, farmId: farm.id, reason: data.reason, now: new Date(), actorId: user.id });
    refresh();
  }, "注文をキャンセルしました。在庫を戻し、お支払い済みの場合はお客さまへ返金しました");
}

export type TrackingPreviewRow = {
  code: string;
  trackingNumber: string;
  id: string | null;
  recipientName: string | null;
  carrier: Carrier | null;
  status: FarmOrderStatus | null;
  ok: boolean;
  reason: string | null;
};

/** Parse a pasted / uploaded tracking CSV and match rows to this farm's orders (no writes). */
export async function previewTrackingImport(input: { text: string }): Promise<ActionResult<TrackingPreviewRow[]>> {
  return runAction(async () => {
    const { farm } = await assertFarm("ship");
    const { text } = parseInput(trackingImportSchema, input);
    const parsed = parseTrackingCsv(text);
    if (!parsed.length) throw new ActionError("注文番号（AM-から始まる番号）と追跡番号の組み合わせが見つかりませんでした");
    const unique = [...new Map(parsed.map((p) => [p.code, p])).values()];
    const matches = await matchOrdersByCode(farm.id, unique.map((p) => p.code));
    const byCode = new Map(matches.map((m) => [m.code, m]));
    return unique.map((p) => {
      const m = byCode.get(p.code);
      const shippable = m ? farmOrderTransitions[m.status].includes("shipped") : false;
      return {
        code: p.code,
        trackingNumber: p.trackingNumber,
        id: m?.id ?? null,
        recipientName: m?.recipientName ?? null,
        carrier: m?.carrier ?? null,
        status: m?.status ?? null,
        ok: Boolean(m && shippable),
        reason: !m ? "この農園の注文ではありません" : !shippable ? `「${farmOrderStatusMeta[m.status].label}」のため登録できません` : null,
      };
    });
  });
}

/** Breakdown drawer on 売上・精算: farm orders included in one payout (read-only). */
export async function fetchPayoutOrders(payoutId: string): Promise<ActionResult<PayoutOrderRow[]>> {
  return runAction(async () => {
    const { farm } = await assertFarm("money");
    const id = parseInput(uuidSchema, payoutId);
    return getPayoutOrders(farm.id, id);
  });
}
