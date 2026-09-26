import "server-only";
import { and, eq, lte, ne } from "drizzle-orm";
import { routes } from "@/config/nav";
import { db } from "@/db";
import { farms, payouts, user, type Payout } from "@/db/schema";
import { toYmd } from "@/lib/dates";
import { formatYen } from "@/lib/format";
import { emailTemplates } from "./email/templates";
import { notify } from "./notify";
import { alertAdmins } from "./ops-alerts";

export type PayoutTransferDeps = {
  /** Re-checks the connected account right before moving money (capabilities can be revoked after onboarding). */
  isReady: (accountId: string) => Promise<boolean>;
  /** Platform balance available for transfers (JPY). */
  availableBalance: () => Promise<number>;
  transfer: (p: { accountId: string; amount: number; payoutId: string; description: string }) => Promise<{ id: string }>;
  /** The transfer Stripe already holds for this payout (a run whose DB write failed, or one older than the idempotency window). */
  findTransfer: TransferLookup;
};

type TransferLookup = (p: { accountId: string; payoutId: string }) => Promise<{ id: string } | null>;

/**
 * Sends every pending payout whose scheduled day has come. One failing transfer must not block the other farms,
 * so each payout is isolated and the reason is stored on the payout (shown in /admin/payouts) for the operator.
 *
 * Payouts larger than the remaining platform balance are skipped *without* calling Stripe: a rejected transfer
 * would pin its idempotency key (payoutId) to that error for ~24h, delaying the retry by a further day.
 * A payout whose transfer already exists in Stripe is recorded instead of sent again: the idempotency key alone
 * protects a retry only for ~24h, and the daily run retries a failed DB write a day later.
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
      const sent = await deps.findTransfer({ accountId: f.stripeAccountId, payoutId: p.id });
      if (sent) {
        if (await recordTransfer(p, f.ownerId, sent.id, now)) transferred++;
        continue;
      }
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
      if (await recordTransfer(p, f.ownerId, t.id, now)) transferred++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[payouts] transfer failed for payout ${p.id}`, e);
      await recordFailure(p.id, message, now);
      failures.push(`${f.name}: ${message}`);
    }
  }
  if (failures.length || unfunded.length) await alertOperators(failures, unfunded);
  return { transferred, awaitingManual, failures, unfunded };
}

async function recordTransfer(p: Payout, ownerId: string, transferId: string, now: Date) {
  const [marked] = await db
    .update(payouts)
    .set({ status: "paid", paidAt: now, stripeTransferId: transferId, transferError: null, transferAttemptedAt: now })
    .where(and(eq(payouts.id, p.id), ne(payouts.status, "paid")))
    .returning({ id: payouts.id });
  if (marked) await notifyPaid(p, ownerId);
  return Boolean(marked);
}

/** 振込完了はお知らせとメールで（#21。Stripe の自動送金・運営の銀行振込のどちらも） */
async function notifyPaid(p: Payout, ownerId: string) {
  const [owner] = await db.select({ email: user.email }).from(user).where(eq(user.id, ownerId));
  const [farm] = await db.select({ name: farms.name }).from(farms).where(eq(farms.id, p.farmId));
  const period = p.periodEnd.slice(0, 7);
  await notify({
    userId: ownerId, type: "payout", title: "売上のお振込が完了しました", body: `${period}分｜${formatYen(p.amount)}`, href: routes.farmer.payouts,
    email: owner && farm ? emailTemplates.payoutPaid({ to: owner.email, farmName: farm.name, period, amount: p.amount }) : undefined,
  });
}

export type ManualPayoutResult =
  | { kind: "not_found" }
  /** Stripe sends this one automatically and has not reported a failure — a bank transfer now could pay twice. */
  | { kind: "automatic" }
  /** Stripe had already sent it; only our record was missing. No bank transfer is needed. */
  | { kind: "already_transferred"; transferId: string }
  | { kind: "marked" };

/**
 * 運営の「振込済みにする」(bank transfer outside Stripe). Refused for a farm Stripe pays automatically unless its last
 * transfer failed, and even then Stripe is asked first: a transfer that went through while our DB write failed also
 * leaves an error on the payout. Marking it paid takes it out of the daily automatic run.
 * `findTransfer` is null when Stripe is not configured (demo): every payout is then paid by hand.
 */
export async function markPayoutPaidManually(payoutId: string, now: Date, findTransfer: TransferLookup | null): Promise<ManualPayoutResult> {
  const [row] = await db
    .select({ p: payouts, f: farms })
    .from(payouts)
    .innerJoin(farms, eq(farms.id, payouts.farmId))
    .where(and(eq(payouts.id, payoutId), ne(payouts.status, "paid")));
  if (!row) return { kind: "not_found" };
  const { p, f } = row;
  if (findTransfer && f.stripeAccountId) {
    if (f.stripeOnboarded && !p.transferError) return { kind: "automatic" };
    const sent = await findTransfer({ accountId: f.stripeAccountId, payoutId: p.id });
    if (sent) {
      await recordTransfer(p, f.ownerId, sent.id, now);
      return { kind: "already_transferred", transferId: sent.id };
    }
  }
  const [marked] = await db
    .update(payouts)
    .set({ status: "paid", paidAt: now })
    .where(and(eq(payouts.id, p.id), ne(payouts.status, "paid")))
    .returning({ id: payouts.id });
  if (!marked) return { kind: "not_found" };
  await notifyPaid(p, f.ownerId);
  return { kind: "marked" };
}

async function recordFailure(payoutId: string, message: string, now: Date) {
  await db.update(payouts).set({ transferError: message, transferAttemptedAt: now }).where(and(eq(payouts.id, payoutId), eq(payouts.status, "pending")));
}

async function alertOperators(failures: string[], unfunded: string[]) {
  const body = [unfunded.length ? `残高不足 ${unfunded.length}件（${unfunded.join("・")}）` : "", failures.length ? `エラー ${failures.length}件` : ""].filter(Boolean).join(" / ");
  await alertAdmins({ title: "送金できなかった精算があります", body, href: routes.admin.payouts });
}
