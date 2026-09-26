import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

/**
 * 停止中の農家の精算（#14）。停止はストアに出さないだけで、進行中の注文の出荷は続けられる。
 * その売上も、精算済みの注文の返金の相殺も、停止中だからといって止めない。
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { createOrder, markOrderPaid, transitionFarmOrder } = await import("@/server/services/orders");
const { refundOrder } = await import("@/server/services/refunds");
const { runJob } = await import("./index");

const address = { recipientName: "テスト", postalCode: "5300001", prefecture: "大阪府", city: "大阪市", line1: "1", phone: "0600000000" };
const monthsAhead = (n: number) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)).toISOString().slice(0, 7);
};
const at = (ym: string, day: number) => new Date(`${ym}-${String(day).padStart(2, "0")}T10:00:00+09:00`);
const farmOrder = async (id: string) => (await db.query.farmOrders.findFirst({ where: eq(s.farmOrders.id, id) }))!;

describe("停止中の農家の精算", () => {
  it("停止後に届けた注文も精算され、精算済みの注文の返金も相殺される", async () => {
    const u = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!;
    const soup = (await db.query.products.findFirst({ where: eq(s.products.slug, "fukura-onion-soup"), with: { variants: true } }))!;
    const [small, large] = soup.variants.sort((a, b) => a.price - b.price);
    // orders are placed while the farm is still open
    const place = async (variantId: string, quantity: number) => {
      const now = new Date();
      const { order } = await createOrder({ userId: u.id, email: u.email, lines: [{ variantId, quantity }], address, paymentProvider: "demo", now });
      await markOrderPaid(order.id, { now });
      const [fo] = await db.select().from(s.farmOrders).where(eq(s.farmOrders.orderId, order.id));
      return { order, fo };
    };
    const deliver = async (foId: string, deliveredAt: Date) => {
      const now = new Date();
      await transitionFarmOrder(foId, "shipped", { source: "farmer", now, trackingNumber: "412377777777" });
      await transitionFarmOrder(foId, "delivered", { source: "cron", now });
      await db.update(s.farmOrders).set({ deliveredAt }).where(eq(s.farmOrders.id, foId));
      return farmOrder(foId);
    };
    const A = await place(small.id, 1);
    const B = await place(large.id, 2);
    await db.update(s.farms).set({ status: "suspended" }).where(eq(s.farms.id, A.fo.farmId));

    // 1) A is shipped and delivered after the suspension → settled at the next close
    const a = await deliver(A.fo.id, new Date());
    expect((await runJob("close-payouts", "manual", at(monthsAhead(1), 2))).ok).toBe(true);
    const settledA = await farmOrder(A.fo.id);
    expect(settledA.payoutId).not.toBeNull();
    // (the payout also carries the seed's delivered orders of this farm)
    expect((await db.query.payouts.findFirst({ where: eq(s.payouts.id, settledA.payoutId!) }))!.farmId).toBe(A.fo.farmId);

    // 2) A is refunded after settlement; B is delivered the next month, farm still suspended
    await refundOrder({ orderId: A.order.id });
    await deliver(B.fo.id, at(monthsAhead(1), 5));
    expect((await runJob("close-payouts", "manual", at(monthsAhead(2), 2))).ok).toBe(true);
    const a2 = await farmOrder(A.fo.id);
    const b2 = await farmOrder(B.fo.id);
    expect(b2.payoutId).not.toBeNull();
    expect(a2.clawbackPayoutId).toBe(b2.payoutId);
    const p = (await db.query.payouts.findFirst({ where: eq(s.payouts.id, b2.payoutId!) }))!;
    expect(p.refundAdjustment).toBe(a.payoutAmount);
    expect(p.amount).toBe(b2.payoutAmount - a.payoutAmount);
  });
});
