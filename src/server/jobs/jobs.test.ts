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
