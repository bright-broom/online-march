"use server";
import { eq } from "drizzle-orm";
import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { bpsToPercent } from "@/config/fees";
import { db } from "@/db";
import { farms, payouts, platformSettings } from "@/db/schema";
import { tags } from "@/lib/cache-tags";
import { features } from "@/lib/env";
import { formatYen } from "@/lib/format";
import { platformCommissionSchema } from "@/lib/validators/admin";
import { assertRole } from "@/server/auth/guards";
import { expireTags } from "@/server/cache";
import { isJobName, jobs, runJob } from "@/server/jobs";
import { readSettingsUncached, type PlatformSettings } from "@/server/queries/settings";
import { recordAudit } from "@/server/services/audit";
import { revealAccountNumber } from "@/server/services/bank-account";
import { markPayoutPaidManually } from "@/server/services/payouts";
import { ActionError, formToObject, parseInput, runAction, type ActionResult } from "./_utils";

/* ───────── Payouts ───────── */

/**
 * Manual bank transfer done outside Stripe → mark the payout as paid. The service refuses farms Stripe pays
 * automatically and records an existing Stripe transfer instead of letting the operator pay twice (#13).
 */
export async function markPayoutPaid(input: { payoutId: string }): Promise<ActionResult<{ alreadyTransferred: boolean }>> {
  return runAction(async () => {
    const me = await assertRole("admin");
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
    const [p] = await db
      .select({ farmId: payouts.farmId, amount: payouts.amount, periodEnd: payouts.periodEnd, farmName: farms.name })
      .from(payouts)
      .innerJoin(farms, eq(farms.id, payouts.farmId))
      .where(eq(payouts.id, payoutId));
    await recordAudit(me, {
      action: "payout.mark_paid", target: { type: "payout", id: payoutId },
      summary: result.kind === "already_transferred"
        ? `${p.farmName} の ${p.periodEnd.slice(0, 7)}分 ${formatYen(p.amount)} を振込済みに（Stripe で送金済みだったため記録だけ合わせた）`
        : `${p.farmName} の ${p.periodEnd.slice(0, 7)}分 ${formatYen(p.amount)} を振込済みに（銀行振込）`,
      detail: { amount: p.amount, kind: result.kind, transferId: result.kind === "already_transferred" ? result.transferId : null },
    });
    expireTags(tags.analytics, tags.farmAnalytics(p.farmId));
    refresh();
    return { alreadyTransferred: result.kind === "already_transferred" };
  }, "振込済みにしました");
}

/**
 * 振込先口座の全桁を表示する（#20）。運営が銀行振込するときだけ使う。誰がいつ見たかを操作記録に残す。
 */
export async function revealFarmBankAccount(input: { farmId: string }): Promise<ActionResult<{ accountNumber: string }>> {
  return runAction(async () => {
    const me = await assertRole("admin");
    const { farmId } = parseInput(z.object({ farmId: z.uuid() }), input);
    const farm = await db.query.farms.findFirst({ where: eq(farms.id, farmId), columns: { name: true } });
    if (!farm) throw new ActionError("生産者が見つかりません");
    let accountNumber: string | null;
    try {
      accountNumber = await revealAccountNumber(farmId);
    } catch {
      // BETTER_AUTH_SECRET を変えると復号できない（services/bank-account.ts）
      throw new ActionError("口座番号を読み出せませんでした。生産者に振込先口座を登録し直してもらってください");
    }
    if (!accountNumber) throw new ActionError("振込先口座が登録されていません");
    await recordAudit(me, { action: "farm.bank_account_reveal", target: { type: "farm", id: farmId }, summary: `${farm.name} の振込先口座番号を表示` });
    return { accountNumber };
  });
}

/* ───────── Automation ───────── */

/** 今すぐ実行 — runs a job with trigger "manual" and returns its summary for the toast. */
export async function runJobNow(input: { job: string }): Promise<ActionResult<{ summary: Record<string, number | string> }>> {
  return runAction(async () => {
    const me = await assertRole("admin");
    const { job } = parseInput(z.object({ job: z.string().min(1) }), input);
    if (!isJobName(job)) throw new ActionError("不明なジョブです");
    const result = await runJob(job, "manual");
    // recorded whether it succeeded or not: running a payout job by hand moves money either way
    await recordAudit(me, {
      action: "job.run", target: { type: "job", id: job },
      summary: `自動処理「${jobs[job].label}」を手動で実行（${result.ok ? "成功" : "失敗"}）`,
      detail: result.ok ? { ok: true, summary: result.summary } : { ok: false, error: result.error },
    });
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
    const me = await assertRole("admin");
    const { ratePercent } = parseInput(platformCommissionSchema, formToObject(formData));
    const before = await readSettingsUncached();
    await upsertSetting("commissionRateBps", ratePercent);
    await recordAudit(me, {
      action: "platform.commission",
      summary: `標準手数料率を ${bpsToPercent(before.commissionRateBps)}% → ${bpsToPercent(ratePercent)}% に変更`,
      detail: { fromBps: before.commissionRateBps, toBps: ratePercent },
    });
    refresh();
    return { bps: ratePercent };
  }, "標準手数料率を更新しました");
}

export async function setMaintenanceMode(input: { enabled: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    const me = await assertRole("admin");
    const { enabled } = parseInput(z.object({ enabled: z.boolean() }), input);
    await upsertSetting("maintenanceMode", enabled);
    await recordAudit(me, { action: "platform.maintenance", summary: `メンテナンスモードを${enabled ? "有効" : "解除"}に`, detail: { enabled } });
    refresh();
  }, input.enabled ? "メンテナンスモードを有効にしました" : "メンテナンスモードを解除しました");
}
