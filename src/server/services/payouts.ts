import "server-only";
import { and, eq, lte } from "drizzle-orm";
import { routes } from "@/config/nav";
import { db } from "@/db";
import { farms, payouts, user } from "@/db/schema";
import { toYmd } from "@/lib/dates";
import { formatYen } from "@/lib/format";
import { notify } from "./notify";

export type PayoutTransferDeps = {
  /** Re-checks the connected account right before moving money (capabilities can be revoked after onboarding). */
  isReady: (accountId: string) => Promise<boolean>;
  /** Platform balance available for transfers (JPY). */
  availableBalance: () => Promise<number>;
  transfer: (p: { accountId: string; amount: number; payoutId: string; description: string }) => Promise<{ id: string }>;
};

/**
 * Sends every pending payout whose scheduled day has come. One failing transfer must not block the other farms,
 * so each payout is isolated and the reason is stored on the payout (shown in /admin/payouts) for the operator.
 *
 * Payouts larger than the remaining platform balance are skipped *without* calling Stripe: a rejected transfer
 * would pin its idempotency key (payoutId) to that error for ~24h, delaying the retry by a further day.
 * The transfer's idempotency key still makes a retry after a failed DB write safe.
 */
export async function executeDuePayouts(now: Date, deps: PayoutTransferDeps | null) {
  const due = await db
    .select({ p: payouts, f: farms })
    .from(payouts)
    .innerJoin(farms, eq(farms.id, payouts.farmId))
    .where(and(eq(payouts.status, "pending"), lte(payouts.scheduledFor, toYmd(now))));
  let transferred = 0;
  let awaitingManual = 0;
  const failures: string[] = [];
  const unfunded: string[] = [];
  let balance = deps && due.length ? await deps.availableBalance() : 0;
  for (const { p, f } of due) {
    if (!deps || !f.stripeAccountId || !f.stripeOnboarded) {
      awaitingManual++; // paid by bank transfer from /admin/payouts
      continue;
    }
    try {
      if (!(await deps.isReady(f.stripeAccountId))) {
        await db.update(farms).set({ stripeOnboarded: false }).where(eq(farms.id, f.id));
        awaitingManual++;
        continue;
      }
      if (p.amount > balance) {
        unfunded.push(`${f.name}（${formatYen(p.amount)}）`);
        await recordFailure(p.id, `プラットフォーム残高が不足しています（利用可能 ${formatYen(balance)} / 必要 ${formatYen(p.amount)}）`, now);
        continue;
      }
      const t = await deps.transfer({ accountId: f.stripeAccountId, amount: p.amount, payoutId: p.id, description: `${p.periodStart}〜${p.periodEnd} 売上精算` });
      balance -= p.amount;
      // an overlapping run gets the same transfer back (idempotency key) — only the first one records and notifies
      const [marked] = await db
        .update(payouts)
        .set({ status: "paid", paidAt: now, stripeTransferId: t.id, transferError: null, transferAttemptedAt: now })
        .where(and(eq(payouts.id, p.id), eq(payouts.status, "pending")))
        .returning({ id: payouts.id });
      if (!marked) continue;
      await notify({ userId: f.ownerId, type: "payout", title: "売上のお振込が完了しました", body: `${p.periodEnd.slice(0, 7)}分｜${formatYen(p.amount)}`, href: routes.farmer.payouts });
      transferred++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[payouts] transfer failed for payout ${p.id}`, e);
      await recordFailure(p.id, message, now);
      failures.push(`${f.name}: ${message}`);
    }
  }
  if (failures.length || unfunded.length) await alertAdmins(failures, unfunded);
  return { transferred, awaitingManual, failures, unfunded };
}

async function recordFailure(payoutId: string, message: string, now: Date) {
  await db.update(payouts).set({ transferError: message, transferAttemptedAt: now }).where(and(eq(payouts.id, payoutId), eq(payouts.status, "pending")));
}

/** The operator only opens /admin/automation when something looks wrong, so push the failure to them. */
async function alertAdmins(failures: string[], unfunded: string[]) {
  const admins = await db.select({ id: user.id }).from(user).where(eq(user.role, "admin"));
  const body = [unfunded.length ? `残高不足 ${unfunded.length}件（${unfunded.join("・")}）` : "", failures.length ? `エラー ${failures.length}件` : ""].filter(Boolean).join(" / ");
  for (const a of admins) {
    await notify({ userId: a.id, type: "payout", title: "送金できなかった精算があります", body, href: routes.admin.payouts });
  }
}
