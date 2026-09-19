import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { createOrder, markOrderPaid, transitionFarmOrder } = await import("../orders");
const { refundOrder } = await import("../refunds");

const address = { recipientName: "返金 テスト", postalCode: "1000001", prefecture: "東京都", city: "千代田区", line1: "1-1", phone: "0300000000" };
let userId = "";
const variant = async (slug: string) =>
  (await db.query.products.findFirst({ where: eq(s.products.slug, slug), with: { variants: true } }))!.variants[0];
const stockOf = async (id: string) => (await db.query.productVariants.findFirst({ where: eq(s.productVariants.id, id) }))!.stock;

async function paidOrder(slugs: string[]) {
  const lines = await Promise.all(slugs.map(async (slug) => ({ variantId: (await variant(slug)).id, quantity: 1 })));
  const now = new Date();
  const { order } = await createOrder({ userId, email: "r@x.jp", lines, address, paymentProvider: "demo", now });
  await markOrderPaid(order.id, { now });
  const fos = await db.select().from(s.farmOrders).where(eq(s.farmOrders.orderId, order.id));
  return { order, fos };
}

describe("refunds", () => {
  beforeAll(async () => {
    userId = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!.id;
  });

  it("refunds a delivered order and records amount/time on the farm order", async () => {
    const { order, fos } = await paidOrder(["awa-tsurigoya-tarzan"]);
    const now = new Date();
    await transitionFarmOrder(fos[0].id, "shipped", { source: "farmer", now, trackingNumber: "412300000001" });
    await transitionFarmOrder(fos[0].id, "delivered", { source: "cron", now });

    const r = await refundOrder({ orderId: order.id });
    expect(r).toEqual({ amount: fos[0].subtotal + fos[0].shippingFee - fos[0].discount, demo: true });

    const fo = await db.query.farmOrders.findFirst({ where: eq(s.farmOrders.id, fos[0].id), with: { events: true } });
    expect(fo!.status).toBe("refunded");
    expect(fo!.refundedAt).toBeInstanceOf(Date);
    expect(fo!.refundAmount).toBe(r.amount);
    expect(fo!.events.some((e) => e.type === "refund")).toBe(true);
    expect((await db.query.orders.findFirst({ where: eq(s.orders.id, order.id) }))!.status).toBe("refunded");
    await expect(refundOrder({ orderId: order.id })).rejects.toThrow(/返金済み/);
  });

  it("partially refunds one farm of a multi-farm order and restores stock before shipment", async () => {
    const { order, fos } = await paidOrder(["matsuho-momiji3", "shichi-shojo-aka"]);
    expect(fos).toHaveLength(2);
    const target = fos[0];
    const item = (await db.select().from(s.orderItems).where(eq(s.orderItems.farmOrderId, target.id)))[0];
    const before = await stockOf(item.variantId!);

    await refundOrder({ orderId: order.id, farmOrderId: target.id });

    expect((await db.query.farmOrders.findFirst({ where: eq(s.farmOrders.id, target.id) }))!.status).toBe("cancelled");
    expect(await stockOf(item.variantId!)).toBe(before + item.quantity);
    // the other farm is untouched, so the order is not fully refunded yet
    expect((await db.query.orders.findFirst({ where: eq(s.orders.id, order.id) }))!.status).toBe("paid");
    await expect(refundOrder({ orderId: order.id, farmOrderId: target.id })).rejects.toThrow(/返金済み/);

    await refundOrder({ orderId: order.id, farmOrderId: fos[1].id });
    expect((await db.query.orders.findFirst({ where: eq(s.orders.id, order.id) }))!.status).toBe("refunded");
  });

  it("rejects refunds while the parcel is in transit", async () => {
    const { order, fos } = await paidOrder(["kashu-gift-box"]);
    await transitionFarmOrder(fos[0].id, "shipped", { source: "farmer", now: new Date(), trackingNumber: "412300000002" });
    await expect(refundOrder({ orderId: order.id })).rejects.toThrow(/配送中/);
  });
});
