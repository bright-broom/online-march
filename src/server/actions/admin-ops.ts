"use server";
import { and, eq, ne } from "drizzle-orm";
import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { routes } from "@/config/nav";
import { db } from "@/db";
import { farms, payouts, platformSettings } from "@/db/schema";
import { tags } from "@/lib/cache-tags";
import { formatYen } from "@/lib/format";
import { platformCommissionSchema } from "@/lib/validators/admin";
import { assertRole } from "@/server/auth/guards";
import { expireTags } from "@/server/cache";
import { isJobName, runJob } from "@/server/jobs";
import type { PlatformSettings } from "@/server/queries/settings";
import { notify } from "@/server/services/notify";
import { ActionError, formToObject, parseInput, runAction, type ActionResult } from "./_utils";

/* ───────── Payouts ───────── */

/** Manual bank transfer done outside Stripe → mark the payout as paid. */
export async function markPayoutPaid(input: { payoutId: string }): Promise<ActionResult> {
  return runAction(async () => {
    await assertRole("admin");
    const { payoutId } = parseInput(z.object({ payoutId: z.uuid() }), input);
    const now = new Date();
    const [p] = await db
      .update(payouts)
      .set({ status: "paid", paidAt: now })
      .where(and(eq(payouts.id, payoutId), ne(payouts.status, "paid")))
      .returning();
    if (!p) throw new ActionError("振込予定の精算が見つかりません（すでに振込済みの可能性があります）");
    const farm = await db.query.farms.findFirst({ where: eq(farms.id, p.farmId), columns: { ownerId: true } });
    if (farm) {
      await notify({ userId: farm.ownerId, type: "payout", title: "売上のお振込が完了しました", body: `${p.periodEnd.slice(0, 7)}分｜${formatYen(p.amount)}`, href: routes.farmer.payouts });
    }
    expireTags(tags.analytics, tags.farmAnalytics(p.farmId));
    refresh();
  }, "振込済みにしました");
}

/* ───────── Automation ───────── */

/** 今すぐ実行 — runs a job with trigger "manual" and returns its summary for the toast. */
export async function runJobNow(input: { job: string }): Promise<ActionResult<{ summary: Record<string, number | string> }>> {
  return runAction(async () => {
    await assertRole("admin");
    const { job } = parseInput(z.object({ job: z.string().min(1) }), input);
    if (!isJobName(job)) throw new ActionError("不明なジョブです");
    const result = await runJob(job, "manual");
    refresh();
    if (!result.ok) throw new ActionError(`ジョブが失敗しました：${result.error}`);
    return { summary: result.summary };
  }, "ジョブを実行しました");
}

/* ───────── Platform settings ───────── */

async function upsertSetting<K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) {
  await db
    .insert(platformSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedAt: new Date() } });
  updateTag(tags.settings);
}

/** Platform default commission. Past orders keep farm_orders.commissionRateBps (fixed at order time). */
export async function updatePlatformCommission(_prev: unknown, formData: FormData): Promise<ActionResult<{ bps: number }>> {
  return runAction(async () => {
    await assertRole("admin");
    const { ratePercent } = parseInput(platformCommissionSchema, formToObject(formData));
    await upsertSetting("commissionRateBps", ratePercent);
    refresh();
    return { bps: ratePercent };
  }, "標準手数料率を更新しました");
}

export async function setMaintenanceMode(input: { enabled: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    await assertRole("admin");
    const { enabled } = parseInput(z.object({ enabled: z.boolean() }), input);
    await upsertSetting("maintenanceMode", enabled);
    refresh();
  }, input.enabled ? "メンテナンスモードを有効にしました" : "メンテナンスモードを解除しました");
}
