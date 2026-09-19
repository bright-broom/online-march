import "server-only";
import { and, eq, inArray, isNotNull, isNull, lt, lte } from "drizzle-orm";
import { feeConfig } from "@/config/fees";
import { routes } from "@/config/nav";
import { shippingPolicy } from "@/config/shipping";
import { db } from "@/db";
import { farmOrders, farms, jobRuns, orders, payouts, user } from "@/db/schema";
import { tags } from "@/lib/cache-tags";
import { addDays, startOfMonthYmd, toYmd } from "@/lib/dates";
import { expireTags } from "@/server/cache";
import { emailTemplates } from "@/server/services/email/templates";
import { features } from "@/lib/env";
import { sendEmail } from "@/server/services/email";
import { notify } from "@/server/services/notify";
import { expireUnpaidOrder, markOrderPaid, transitionFarmOrder } from "@/server/services/orders";
import { executeDuePayouts } from "@/server/services/payouts";
import { fetchTrackingStatus } from "@/server/services/shipping/tracking";

/**
 * Shipping/finance automation. Each job is idempotent and safe to re-run.
 * Triggered by Vercel Cron (vercel.json → /api/cron/[job]) or manually from /admin/automation.
 * See docs/SHIPPING.md §Automation.
 */
type JobResult = Record<string, number | string>;
type Job = { label: string; description: string; schedule: string; run: (now: Date) => Promise<JobResult> };

const DAY = 86_400_000;

export const jobs = {
  "cancel-unpaid": {
    label: "未入金注文の自動キャンセル",
    description: `決済が${shippingPolicy.pendingPaymentTtlMinutes}分以内に完了しない注文をキャンセルし在庫を戻します（コンビニ払いの入金待ちは最大${shippingPolicy.asyncPaymentTtlDays}日待機）`,
    schedule: "30分ごと",
    async run(now) {
      const cutoff = new Date(now.getTime() - shippingPolicy.pendingPaymentTtlMinutes * 60_000);
      const asyncCutoff = now.getTime() - shippingPolicy.asyncPaymentTtlDays * DAY;
      const stale = await db
        .select({ id: orders.id, sessionId: orders.stripeSessionId, createdAt: orders.createdAt })
        .from(orders)
        .where(and(eq(orders.status, "pending_payment"), lt(orders.createdAt, cutoff)));
      let cancelled = 0, recovered = 0, awaiting = 0, failed = 0;
      for (const o of stale) {
        try {
          // Ask Stripe before cancelling: the session may be paid (missed webhook) or awaiting a konbini payment.
          if (features.stripe && o.sessionId) {
            const { resolveStaleCheckout } = await import("@/server/services/payments/stripe");
            const r = await resolveStaleCheckout(o.sessionId);
            if (r.kind === "paid") {
              await markOrderPaid(o.id, { paymentIntentId: r.paymentIntentId, sessionId: o.sessionId, now });
              recovered++;
              continue;
            }
            if (r.kind === "awaiting_async" && o.createdAt.getTime() > asyncCutoff) {
              awaiting++;
              continue;
            }
          }
          await expireUnpaidOrder(o.id, now);
          cancelled++;
        } catch (e) {
          console.error("[cancel-unpaid]", o.id, e);
          failed++;
        }
      }
      return { cancelled, recovered, awaiting, failed };
    },
  },

  "ship-reminders": {
    label: "出荷期限リマインド",
    description: "出荷期限が明日以前の未発送注文を生産者にメールとアプリ通知でお知らせします",
    schedule: "毎朝8時",
    async run(now) {
      const tomorrow = addDays(toYmd(now), 1);
      const due = await db
        .select({ fo: farmOrders, farm: farms, owner: user })
        .from(farmOrders)
        .innerJoin(farms, eq(farms.id, farmOrders.farmId))
        .innerJoin(user, eq(user.id, farms.ownerId))
        .where(and(inArray(farmOrders.status, ["paid", "preparing"]), lte(farmOrders.shipByDate, tomorrow), isNull(farmOrders.reminderSentAt)));
      const byFarm = new Map<string, typeof due>();
      for (const d of due) (byFarm.get(d.farm.id) ?? byFarm.set(d.farm.id, []).get(d.farm.id)!).push(d);
      const today = toYmd(now);
      for (const list of byFarm.values()) {
        const { farm, owner } = list[0];
        const overdue = list.filter((d) => (d.fo.shipByDate ?? "") < today).length;
        await notify({
          userId: owner.id, type: "shipping", title: `出荷期限が近い注文が${list.length}件あります`,
          body: overdue ? `うち${overdue}件は期限超過です` : "出荷センターで送り状を発行しましょう", href: routes.farmer.shipping,
          email: emailTemplates.shipReminder({ to: owner.email, farmName: farm.name, count: list.length, overdue }),
        });
      }
      if (due.length) await db.update(farmOrders).set({ reminderSentAt: now }).where(inArray(farmOrders.id, due.map((d) => d.fo.id)));
      return { farms: byFarm.size, orders: due.length };
    },
  },

  "sync-tracking": {
    label: "配送状況の同期",
    description: `発送済みの荷物の配達状況を確認し、完了を自動反映します（API非対応時は発送${shippingPolicy.autoDeliveredAfterDays}日後に自動完了）`,
    schedule: "3時間ごと",
    async run(now) {
      const shipped = await db.select().from(farmOrders).where(eq(farmOrders.status, "shipped"));
      let delivered = 0;
      for (const fo of shipped) {
        const status = fo.trackingNumber ? await fetchTrackingStatus(fo.carrier, fo.trackingNumber) : null;
        const autoDue = fo.shippedAt && now.getTime() - fo.shippedAt.getTime() > shippingPolicy.autoDeliveredAfterDays * DAY;
        if (status?.status === "delivered" || (!status && autoDue)) {
          await transitionFarmOrder(fo.id, "delivered", { source: "cron", now, note: status ? "配達完了（配送業者連携）" : "お届け予定日を過ぎたため配達完了としました" });
          delivered++;
        }
      }
      return { checked: shipped.length, delivered };
    },
  },

  "review-requests": {
    label: "レビュー依頼メール",
    description: `配達完了から${shippingPolicy.reviewRequestAfterDays}日後に、お客様へレビューのお願いを送ります`,
    schedule: "毎日10時",
    async run(now) {
      const cutoff = new Date(now.getTime() - shippingPolicy.reviewRequestAfterDays * DAY);
      const due = await db.query.farmOrders.findMany({
        where: and(eq(farmOrders.status, "delivered"), isNull(farmOrders.reviewRequestedAt), lt(farmOrders.deliveredAt, cutoff)),
        with: { order: true, farm: true, items: { with: { product: true } } },
        limit: 200,
      });
      for (const fo of due) {
        const item = fo.items.find((i) => i.product);
        if (item?.product) {
          await sendEmail(emailTemplates.reviewRequest({ to: fo.order.email, name: fo.order.shippingAddress.recipientName, farmName: fo.farm.name, productName: item.productName, productSlug: item.product.slug }));
        }
      }
      if (due.length) await db.update(farmOrders).set({ reviewRequestedAt: now }).where(inArray(farmOrders.id, due.map((d) => d.id)));
      return { sent: due.length };
    },
  },

  "close-payouts": {
    label: "月次精算・振込",
    description: `前月までに配達完了した売上を締めて精算を作成し、振込予定日（毎月${feeConfig.payout.payoutDay}日）に Stripe Connect で送金します`,
    schedule: "毎日 深夜（締めは月初・送金は振込予定日以降）",
    async run(now) {
      const monthStart = startOfMonthYmd(now);
      const payoutDay = `${monthStart.slice(0, 8)}${String(feeConfig.payout.payoutDay).padStart(2, "0")}`;
      const periodEnd = addDays(monthStart, -1);
      const activeFarms = await db.select().from(farms).where(eq(farms.status, "active"));
      let created = 0;
      for (const farm of activeFarms) {
        const cutoff = new Date(`${monthStart}T00:00:00+09:00`);
        const rows = await db
          .select()
          .from(farmOrders)
          .where(and(eq(farmOrders.farmId, farm.id), eq(farmOrders.status, "delivered"), isNull(farmOrders.payoutId), lt(farmOrders.deliveredAt, cutoff)));
        // refunds of farm orders that were already settled in an earlier payout → claw back now
        const clawbacks = await db
          .select()
          .from(farmOrders)
          .where(and(eq(farmOrders.farmId, farm.id), isNotNull(farmOrders.payoutId), isNotNull(farmOrders.refundedAt), isNull(farmOrders.clawbackPayoutId), lt(farmOrders.refundedAt, cutoff)));
        if (!rows.length && !clawbacks.length) continue;
        const gross = rows.reduce((a, r) => a + r.subtotal, 0);
        const ship = rows.reduce((a, r) => a + r.shippingFee, 0);
        const commission = rows.reduce((a, r) => a + r.commissionAmount, 0);
        const refundAdjustment = clawbacks.reduce((a, r) => a + r.payoutAmount, 0);
        const amount = gross + ship - commission - refundAdjustment;
        // below minimum (or negative after clawbacks) → everything carries over to next month
        if (amount < feeConfig.payout.minimumAmount && feeConfig.payout.carryOver) continue;
        const starts = [...rows.map((r) => toYmd(r.deliveredAt!)), ...clawbacks.map((r) => toYmd(r.refundedAt!))].sort();
        const periodStart = starts[0].slice(0, 8) + "01";
        const [p] = await db
          .insert(payouts)
          .values({ farmId: farm.id, periodStart, periodEnd, grossSales: gross, shippingFees: ship, commission, refundAdjustment, amount, orderCount: rows.length, scheduledFor: payoutDay })
          .returning();
        if (rows.length) await db.update(farmOrders).set({ payoutId: p.id }).where(inArray(farmOrders.id, rows.map((r) => r.id)));
        if (clawbacks.length) await db.update(farmOrders).set({ clawbackPayoutId: p.id }).where(inArray(farmOrders.id, clawbacks.map((r) => r.id)));
        const owner = await db.query.user.findFirst({ where: eq(user.id, farm.ownerId) });
        await notify({
          userId: farm.ownerId, type: "payout", title: "売上精算が確定しました",
          body: `${periodEnd.slice(0, 7)}分${refundAdjustment ? `（返金調整 −${refundAdjustment.toLocaleString()}円を含む）` : ""}`, href: routes.farmer.payouts,
          email: owner ? emailTemplates.payoutScheduled({ to: owner.email, farmName: farm.name, amount, scheduledFor: payoutDay, period: periodEnd.slice(0, 7) }) : undefined,
        });
        created++;
      }
      // execute transfers that are due (runs daily, so the payout day is honoured and failed transfers retry)
      const stripe = features.stripe ? await import("@/server/services/payments/stripe") : null;
      const { transferred, awaitingManual, failures } = await executeDuePayouts(
        now,
        stripe && { isReady: stripe.fetchPayoutReady, transfer: stripe.transferToFarm },
      );
      expireTags(tags.analytics);
      // surface failures as a failed run (visible on /admin/automation) after every other farm has been paid
      if (failures.length) throw new Error(`送金失敗 ${failures.length}件（成功 ${transferred}件・精算作成 ${created}件）: ${failures.join(" / ")}`);
      return { created, transferred, awaitingManual };
    },
  },
} satisfies Record<string, Job>;

export type JobName = keyof typeof jobs;
export const isJobName = (n: string): n is JobName => n in jobs;

/** Run a job and record it in job_runs. */
export async function runJob(name: JobName, trigger: "cron" | "manual", now = new Date()) {
  const startedAt = new Date();
  try {
    const summary = await jobs[name].run(now);
    await db.insert(jobRuns).values({ job: name, status: "success", trigger, summary, startedAt });
    return { ok: true as const, summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[job:${name}]`, err);
    await db.insert(jobRuns).values({ job: name, status: "error", trigger, summary: { error: message }, startedAt });
    return { ok: false as const, error: message };
  }
}

