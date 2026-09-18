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
