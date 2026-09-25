"use server";
import { eq } from "drizzle-orm";
import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { payouts, platformSettings } from "@/db/schema";
import { tags } from "@/lib/cache-tags";
import { features } from "@/lib/env";
import { platformCommissionSchema } from "@/lib/validators/admin";
import { assertRole } from "@/server/auth/guards";
import { expireTags } from "@/server/cache";
import { isJobName, runJob } from "@/server/jobs";
import type { PlatformSettings } from "@/server/queries/settings";
import { markPayoutPaidManually } from "@/server/services/payouts";
import { ActionError, formToObject, parseInput, runAction, type ActionResult } from "./_utils";

/* ───────── Payouts ───────── */

/**
 * Manual bank transfer done outside Stripe → mark the payout as paid. The service refuses farms Stripe pays
 * automatically and records an existing Stripe transfer instead of letting the operator pay twice (#13).
 */
export async function markPayoutPaid(input: { payoutId: string }): Promise<ActionResult<{ alreadyTransferred: boolean }>> {
  return runAction(async () => {
    await assertRole("admin");
    const { payoutId } = parseInput(z.object({ payoutId: z.uuid() }), input);
    const stripe = features.stripe ? await import("@/server/services/payments/stripe") : null;
    let result;
    try {
      result = await markPayoutPaidManually(payoutId, new Date(), stripe && stripe.findPayoutTransfer);
    } catch (e) {
      console.error("[payouts] manual mark failed", e);
      throw new ActionError("Stripe の送金記録を確認できませんでした。時間をおいて再度お試しください（振込はまだ行わないでください）");
    }
    if (result.kind === "not_found") throw new ActionError("振込予定の精算が見つかりません（すでに振込済みの可能性があります）");
    if (result.kind === "automatic") throw new ActionError("この生産者には Stripe から自動で送金されます。送金の失敗が記録されたときだけ手動で記録できます");
    const [p] = await db.select({ farmId: payouts.farmId }).from(payouts).where(eq(payouts.id, payoutId));
    expireTags(tags.analytics, tags.farmAnalytics(p.farmId));
    refresh();
    return { alreadyTransferred: result.kind === "already_transferred" };
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
