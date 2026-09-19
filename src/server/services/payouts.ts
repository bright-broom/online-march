import "server-only";
import { and, eq, lte } from "drizzle-orm";
import { routes } from "@/config/nav";
import { db } from "@/db";
import { farms, payouts } from "@/db/schema";
import { toYmd } from "@/lib/dates";
import { formatYen } from "@/lib/format";
import { notify } from "./notify";

export type PayoutTransferDeps = {
  /** Re-checks the connected account right before moving money (capabilities can be revoked after onboarding). */
  isReady: (accountId: string) => Promise<boolean>;
  transfer: (p: { accountId: string; amount: number; payoutId: string; description: string }) => Promise<{ id: string }>;
};

/**
 * Sends every pending payout whose scheduled day has come. One failing transfer (e.g. insufficient platform
 * balance) must not block the other farms, so each payout is isolated and failures are returned for the caller
 * to surface. The transfer's idempotency key (payoutId) makes a retry after a failed DB write safe.
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
      const t = await deps.transfer({ accountId: f.stripeAccountId, amount: p.amount, payoutId: p.id, description: `${p.periodStart}〜${p.periodEnd} 売上精算` });
      await db.update(payouts).set({ status: "paid", paidAt: now, stripeTransferId: t.id }).where(eq(payouts.id, p.id));
      await notify({ userId: f.ownerId, type: "payout", title: "売上のお振込が完了しました", body: `${p.periodEnd.slice(0, 7)}分｜${formatYen(p.amount)}`, href: routes.farmer.payouts });
      transferred++;
    } catch (e) {
      console.error(`[payouts] transfer failed for payout ${p.id}`, e);
      failures.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { transferred, awaitingManual, failures };
}
