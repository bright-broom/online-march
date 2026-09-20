import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { createOrder, markOrderPaid, transitionFarmOrder } = await import("@/server/services/orders");
const { runJob } = await import("./index");

const DAY = 86_400_000;
const address = { recipientName: "テスト", postalCode: "5300001", prefecture: "大阪府", city: "大阪市", line1: "1", phone: "0600000000" };

describe("automation jobs", () => {
  let userId = "";
  let variantId = "";
  beforeAll(async () => {
    const u = await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") });
    userId = u!.id;
    const p = await db.query.products.findFirst({ where: eq(s.products.slug, "awa-tsurigoya-tarzan"), with: { variants: true } });
    variantId = p!.variants[0].id;
  });

  it("cancel-unpaid expires stale pending orders and restores stock", async () => {
    const before = (await db.query.productVariants.findFirst({ where: eq(s.productVariants.id, variantId) }))!.stock;
    const { order } = await createOrder({ userId, email: "c@x.jp", lines: [{ variantId, quantity: 1 }], address, paymentProvider: "stripe", now: new Date() });
    await db.update(s.orders).set({ createdAt: new Date(Date.now() - 2 * 3600_000) }).where(eq(s.orders.id, order.id));
    const r = await runJob("cancel-unpaid", "manual");
    expect(r.ok).toBe(true);
    expect((await db.query.orders.findFirst({ where: eq(s.orders.id, order.id) }))!.status).toBe("cancelled");
    expect((await db.query.productVariants.findFirst({ where: eq(s.productVariants.id, variantId) }))!.stock).toBe(before);
  });

  it("sync-tracking auto-delivers shipments older than the policy window", async () => {
    const now = new Date();
    const { order } = await createOrder({ userId, email: "c@x.jp", lines: [{ variantId, quantity: 1 }], address, paymentProvider: "demo", now });
    await markOrderPaid(order.id, { now });
    const [fo] = await db.select().from(s.farmOrders).where(eq(s.farmOrders.orderId, order.id));
    await transitionFarmOrder(fo.id, "shipped", { source: "farmer", now, trackingNumber: "412345678999" });
    await db.update(s.farmOrders).set({ shippedAt: new Date(now.getTime() - 5 * DAY) }).where(eq(s.farmOrders.id, fo.id));
    const r = await runJob("sync-tracking", "manual");
    expect(r.ok).toBe(true);
    expect((await db.query.farmOrders.findFirst({ where: eq(s.farmOrders.id, fo.id) }))!.status).toBe("delivered");
  });

  it("all jobs run cleanly and are logged", async () => {
    for (const j of ["ship-reminders", "review-requests", "close-payouts"] as const) {
      const r = await runJob(j, "manual");
      expect(r.ok, JSON.stringify(r)).toBe(true);
    }
    const runs = await db.select().from(s.jobRuns).where(eq(s.jobRuns.trigger, "manual"));
    expect(runs.length).toBeGreaterThanOrEqual(5);
  });
});

describe("close-payouts: refund clawback", () => {
  const monthsAhead = (n: number) => {
    const d = new Date();
    const ym = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
    return `${ym.toISOString().slice(0, 7)}`;
  };
  const at = (ym: string, day: number) => new Date(`${ym}-${String(day).padStart(2, "0")}T10:00:00+09:00`);

  it("deducts a refund of an already-settled order from the next payout", async () => {
    const { refundOrder } = await import("@/server/services/refunds");
    const u = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!;
    const soup = (await db.query.products.findFirst({ where: eq(s.products.slug, "fukura-onion-soup"), with: { variants: true } }))!;
    const [small, large] = soup.variants.sort((a, b) => a.price - b.price);
    const deliver = async (variantId: string, qty: number, deliveredAt: Date) => {
      const now = new Date();
      const { order } = await createOrder({ userId: u.id, email: u.email, lines: [{ variantId, quantity: qty }], address, paymentProvider: "demo", now });
      await markOrderPaid(order.id, { now });
      const [fo] = await db.select().from(s.farmOrders).where(eq(s.farmOrders.orderId, order.id));
      await transitionFarmOrder(fo.id, "shipped", { source: "farmer", now, trackingNumber: "412399999999" });
      await transitionFarmOrder(fo.id, "delivered", { source: "cron", now });
      await db.update(s.farmOrders).set({ deliveredAt }).where(eq(s.farmOrders.id, fo.id));
      return { order, fo: (await db.query.farmOrders.findFirst({ where: eq(s.farmOrders.id, fo.id) }))! };
    };

    // 1) A is delivered now and settled at the next month's close
    const A = await deliver(small.id, 1, new Date());
    expect((await runJob("close-payouts", "manual", at(monthsAhead(1), 2))).ok).toBe(true);
    const settledA = (await db.query.farmOrders.findFirst({ where: eq(s.farmOrders.id, A.fo.id) }))!;
    expect(settledA.payoutId).not.toBeNull();

    // 2) A is refunded after settlement; B is delivered next month
    await refundOrder({ orderId: A.order.id });
    const B = await deliver(large.id, 2, at(monthsAhead(1), 5));

    // 3) the following close deducts A's payout amount from B's payout
    expect((await runJob("close-payouts", "manual", at(monthsAhead(2), 2))).ok).toBe(true);
    const a2 = (await db.query.farmOrders.findFirst({ where: eq(s.farmOrders.id, A.fo.id) }))!;
    const b2 = (await db.query.farmOrders.findFirst({ where: eq(s.farmOrders.id, B.fo.id) }))!;
    expect(a2.clawbackPayoutId).not.toBeNull();
    expect(a2.clawbackPayoutId).toBe(b2.payoutId);
    const p = (await db.query.payouts.findFirst({ where: eq(s.payouts.id, b2.payoutId!) }))!;
    expect(p.refundAdjustment).toBe(A.fo.payoutAmount);
    expect(p.amount).toBe(B.fo.payoutAmount - A.fo.payoutAmount);

    // idempotent: re-running the same close does not deduct twice
    expect((await runJob("close-payouts", "manual", at(monthsAhead(2), 2))).ok).toBe(true);
    const payoutsForB = await db.select().from(s.payouts).where(eq(s.payouts.id, b2.payoutId!));
    expect(payoutsForB).toHaveLength(1);
    expect((await db.query.farmOrders.findFirst({ where: eq(s.farmOrders.id, A.fo.id) }))!.clawbackPayoutId).toBe(p.id);
  });
});

describe("executeDuePayouts", () => {
  it("isolates a failing transfer, re-checks readiness and pays the others", async () => {
    const { executeDuePayouts } = await import("@/server/services/payouts");
    const { toYmd } = await import("@/lib/dates");
    const now = new Date();
    const [ok, broken, revoked, manual] = await db.select().from(s.farms).where(eq(s.farms.status, "active")).limit(4);
    const acct = { [ok.id]: "acct_ok", [broken.id]: "acct_broken", [revoked.id]: "acct_revoked" };
    for (const f of [ok, broken, revoked]) await db.update(s.farms).set({ stripeAccountId: acct[f.id], stripeOnboarded: true }).where(eq(s.farms.id, f.id));
    await db.update(s.farms).set({ stripeAccountId: null, stripeOnboarded: false }).where(eq(s.farms.id, manual.id));
    const due = { periodStart: "2026-08-01", periodEnd: "2026-08-31", grossSales: 1000, shippingFees: 0, commission: 0, amount: 1000, orderCount: 1, scheduledFor: toYmd(now) };
    const rows = await db.insert(s.payouts).values([ok, broken, revoked, manual].map((f) => ({ ...due, farmId: f.id }))).returning();
    const byFarm = (id: string) => rows.find((r) => r.farmId === id)!.id;

    const transfer = vi.fn(async (p: { accountId: string }) => {
      if (p.accountId === "acct_broken") throw new Error("balance_insufficient");
      return { id: `tr_${p.accountId}` };
    });
    const deps = { isReady: async (id: string) => id !== "acct_revoked", availableBalance: async () => 10_000, transfer };
    const r = await executeDuePayouts(now, deps);

    expect(r.transferred).toBe(1);
    expect(r.awaitingManual).toBe(2); // revoked + no account
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]).toContain("balance_insufficient");
    expect((await db.query.payouts.findFirst({ where: eq(s.payouts.id, byFarm(broken.id)) }))!.transferError).toContain("balance_insufficient");
    expect(transfer).toHaveBeenCalledTimes(2); // never called for the revoked account
    const status = async (id: string) => (await db.query.payouts.findFirst({ where: eq(s.payouts.id, id) }))!;
    expect(await status(byFarm(ok.id))).toMatchObject({ status: "paid", stripeTransferId: "tr_acct_ok" });
    expect((await status(byFarm(broken.id))).status).toBe("pending"); // retried on the next daily run
    expect((await status(byFarm(revoked.id))).status).toBe("pending");
    expect((await db.query.farms.findFirst({ where: eq(s.farms.id, revoked.id) }))!.stripeOnboarded).toBe(false);
    const notes = await db.select().from(s.notifications).where(eq(s.notifications.userId, ok.ownerId));
    expect(notes.some((n) => n.title === "売上のお振込が完了しました")).toBe(true);

    // re-running pays nothing twice
    transfer.mockClear();
    const again = await executeDuePayouts(now, deps);
    expect(transfer).toHaveBeenCalledTimes(1); // only the still-pending broken one is retried
    expect(again.transferred).toBe(0);
  });
});

describe("close-payouts: concurrent runs", () => {
  it("settles each delivered order into exactly one payout when two runs overlap", async () => {
    const u = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!;
    const product = (await db.query.products.findFirst({ where: eq(s.products.slug, "awa-tsurigoya-tarzan"), with: { variants: true } }))!;
    const now = new Date();
    const { order } = await createOrder({ userId: u.id, email: u.email, lines: [{ variantId: product.variants[0].id, quantity: 1 }], address, paymentProvider: "demo", now });
    await markOrderPaid(order.id, { now });
    const [fo] = await db.select().from(s.farmOrders).where(eq(s.farmOrders.orderId, order.id));
    await transitionFarmOrder(fo.id, "shipped", { source: "farmer", now, trackingNumber: "412388888888" });
    await transitionFarmOrder(fo.id, "delivered", { source: "cron", now });

    // a cron retry and a manual "今すぐ実行" landing at the same moment, three months ahead (clear of other tests)
    const d = new Date();
    const closeAt = new Date(`${new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1)).toISOString().slice(0, 7)}-02T10:00:00+09:00`);
    const results = await Promise.all([runJob("close-payouts", "manual", closeAt), runJob("close-payouts", "manual", closeAt)]);
    expect(results.every((r) => r.ok), JSON.stringify(results)).toBe(true);

    const settled = (await db.query.farmOrders.findFirst({ where: eq(s.farmOrders.id, fo.id) }))!;
    expect(settled.payoutId).not.toBeNull();
    // no orphan payout that also counts this order (it would be transferred a second time)
    const created = await db.select().from(s.payouts).where(eq(s.payouts.farmId, fo.farmId));
    const forThisClose = created.filter((p) => p.createdAt.getTime() > now.getTime());
    expect(forThisClose.map((p) => p.id)).toEqual([settled.payoutId]);
  });
});

describe("executeDuePayouts: concurrent runs", () => {
  it("records a payout once and notifies once when two runs send the same transfer", async () => {
    const { executeDuePayouts } = await import("@/server/services/payouts");
    const { toYmd } = await import("@/lib/dates");
    const now = new Date();
    const [farm] = await db.select().from(s.farms).where(eq(s.farms.status, "active")).limit(1);
    await db.update(s.farms).set({ stripeAccountId: "acct_race", stripeOnboarded: true }).where(eq(s.farms.id, farm.id));
    await db.update(s.payouts).set({ status: "paid" }).where(eq(s.payouts.status, "pending")); // isolate from earlier tests
    const [p] = await db
      .insert(s.payouts)
      .values({ farmId: farm.id, periodStart: "2026-07-01", periodEnd: "2026-07-31", grossSales: 1234, shippingFees: 0, commission: 0, amount: 1234, orderCount: 1, scheduledFor: toYmd(now) })
      .returning();
    const deps = { isReady: async () => true, availableBalance: async () => 10_000, transfer: async () => ({ id: "tr_same" }) }; // Stripe returns the same transfer for the same key
    const [a, b] = await Promise.all([executeDuePayouts(now, deps), executeDuePayouts(now, deps)]);

    expect(a.transferred + b.transferred).toBe(1);
    expect((await db.query.payouts.findFirst({ where: eq(s.payouts.id, p.id) }))).toMatchObject({ status: "paid", stripeTransferId: "tr_same" });
    const notes = await db.select().from(s.notifications).where(eq(s.notifications.userId, farm.ownerId));
    expect(notes.filter((n) => n.body.startsWith("2026-07分")).length).toBe(1);
  });
});

describe("executeDuePayouts: platform balance", () => {
  it("skips payouts the balance cannot cover without calling Stripe, records why and alerts admins", async () => {
    const { executeDuePayouts } = await import("@/server/services/payouts");
    const { toYmd } = await import("@/lib/dates");
    const now = new Date();
    const [farm] = await db.select().from(s.farms).where(eq(s.farms.status, "active")).limit(1);
    await db.update(s.farms).set({ stripeAccountId: "acct_funds", stripeOnboarded: true }).where(eq(s.farms.id, farm.id));
    await db.update(s.payouts).set({ status: "paid" }).where(eq(s.payouts.status, "pending")); // isolate from earlier tests
    const due = { farmId: farm.id, periodStart: "2026-06-01", periodEnd: "2026-06-30", grossSales: 0, shippingFees: 0, commission: 0, orderCount: 1, scheduledFor: toYmd(now) };
    const [small] = await db.insert(s.payouts).values({ ...due, amount: 800 }).returning();
    const [big] = await db.insert(s.payouts).values({ ...due, amount: 5000 }).returning();
    const admin = (await db.query.user.findFirst({ where: eq(s.user.email, "admin@demo.awaji") }))!;
    const adminNotesBefore = (await db.select().from(s.notifications).where(eq(s.notifications.userId, admin.id))).length;

    const transfer = vi.fn(async () => ({ id: "tr_small" }));
    const r = await executeDuePayouts(now, { isReady: async () => true, availableBalance: async () => 1000, transfer });

    expect(r.transferred).toBe(1);
    expect(r.unfunded).toHaveLength(1);
    expect(r.failures).toHaveLength(0);
    expect(transfer).toHaveBeenCalledTimes(1); // the 5,000-yen payout never reached Stripe
    expect((await db.query.payouts.findFirst({ where: eq(s.payouts.id, small.id) }))!.status).toBe("paid");
    const unpaid = (await db.query.payouts.findFirst({ where: eq(s.payouts.id, big.id) }))!;
    expect(unpaid.status).toBe("pending");
    expect(unpaid.transferError).toContain("残高が不足");
    expect(unpaid.transferAttemptedAt).not.toBeNull();
    const adminNotes = await db.select().from(s.notifications).where(eq(s.notifications.userId, admin.id));
    expect(adminNotes.length).toBe(adminNotesBefore + 1);
    expect(adminNotes.at(-1)!.title).toBe("送金できなかった精算があります");

    // funded on a later run: the transfer goes through and the error is cleared
    const r2 = await executeDuePayouts(now, { isReady: async () => true, availableBalance: async () => 9000, transfer: async () => ({ id: "tr_big" }) });
    expect(r2.transferred).toBe(1);
    expect(await db.query.payouts.findFirst({ where: eq(s.payouts.id, big.id) })).toMatchObject({ status: "paid", stripeTransferId: "tr_big", transferError: null });
  });
});

describe("operational alerts", () => {
  const adminId = async () => (await db.query.user.findFirst({ where: eq(s.user.email, "admin@demo.awaji") }))!.id;
  const adminNotes = async (title: string) =>
    (await db.select().from(s.notifications).where(eq(s.notifications.userId, await adminId()))).filter((n) => n.title.startsWith(title));

  it("tells admins when a job fails, once per problem", async () => {
    const { runJob, jobs } = await import("./index");
    const before = (await adminNotes("自動処理が失敗しました")).length;
    vi.spyOn(jobs["sync-tracking"], "run").mockRejectedValue(new Error("tracking API down"));

    expect((await runJob("sync-tracking", "cron")).ok).toBe(false);
    const after = await adminNotes("自動処理が失敗しました");
    expect(after.length).toBe(before + 1);
    expect(after.at(-1)!.body).toContain("tracking API down");

    // the same failure on the next run does not add a second notification
    await runJob("sync-tracking", "cron");
    expect((await adminNotes("自動処理が失敗しました")).length).toBe(before + 1);
    vi.restoreAllMocks();
  });

  it("alerts when a cron stopped running and stays quiet once it recovers", async () => {
    const { alertOnStaleJobs } = await import("./index");
    await db.delete(s.jobRuns);
    const before = (await adminNotes("自動処理が動いていません")).length;

    const stale = await alertOnStaleJobs(new Date());
    expect(stale).toContain("close-payouts"); // no successful run at all
    const notes = await adminNotes("自動処理が動いていません");
    expect(notes.length).toBe(before + 1);
    expect(notes.at(-1)!.body).toContain("実行記録なし");

    // every job succeeded just now → nothing stale
    const now = new Date();
    await db.insert(s.jobRuns).values((["cancel-unpaid", "ship-reminders", "sync-tracking", "review-requests", "close-payouts"] as const).map((job) => ({ job, status: "success" as const, trigger: "cron" as const, summary: {}, startedAt: now })));
    expect(await alertOnStaleJobs(now)).toEqual([]);

    // a job whose last success is older than its maxAgeHours is reported again
    await db.update(s.jobRuns).set({ startedAt: new Date(now.getTime() - 40 * 3600_000) }).where(eq(s.jobRuns.job, "cancel-unpaid"));
    expect(await alertOnStaleJobs(now)).toEqual(["cancel-unpaid"]);
  });
});
