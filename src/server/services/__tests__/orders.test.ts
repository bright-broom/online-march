import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const orders = await import("../orders");

async function pickVariant(slug: string) {
  const p = await db.query.products.findFirst({ where: eq(s.products.slug, slug), with: { variants: true } });
  return p!.variants[0];
}
const customer = () => db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") });
const address = { recipientName: "テスト 太郎", postalCode: "1000001", prefecture: "東京都", city: "千代田区", line1: "1-1", phone: "0300000000" };

describe("order lifecycle", () => {
  beforeAll(async () => {
    await db.select().from(s.user).limit(1); // wait for migrate + seed
  });

  it("quotes multi-farm carts with per-farm shipping and a coupon", async () => {
    const a = await pickVariant("awa-tsurigoya-tarzan");
    const b = await pickVariant("shichi-shojo-aka");
    const q = await orders.quoteCart({ lines: [{ variantId: a.id, quantity: 1 }, { variantId: b.id, quantity: 1 }], prefecture: "東京都", couponCode: "WELCOME500", now: new Date() });
    expect(q.farms).toHaveLength(2);
    expect(q.subtotal).toBe(a.price + b.price);
    expect(q.discountTotal).toBe(500);
    expect(q.total).toBe(q.subtotal + q.shippingTotal - 500);
    expect(q.farms.every((f) => f.shipping.fee > 0)).toBe(true);
  });

  it("creates → pays → ships → delivers, and cancel restores stock", async () => {
    const me = (await customer())!;
    const v = await pickVariant("matsuho-momiji3");
    const before = v.stock;
    const now = new Date();

    const { order } = await orders.createOrder({ userId: me.id, email: me.email, lines: [{ variantId: v.id, quantity: 2 }], address, paymentProvider: "demo", now });
    const reserved = await db.query.productVariants.findFirst({ where: eq(s.productVariants.id, v.id) });
    expect(reserved!.stock).toBe(before - 2);

    const paid = await orders.markOrderPaid(order.id, { now });
    expect(paid?.status).toBe("paid");
    expect(await orders.markOrderPaid(order.id, { now })).toBeNull(); // idempotent

    const [fo] = await db.select().from(s.farmOrders).where(eq(s.farmOrders.orderId, order.id));
    expect(fo.status).toBe("paid");
    await expect(orders.transitionFarmOrder(fo.id, "shipped", { source: "farmer", now })).rejects.toThrow(/追跡番号/);
    await orders.transitionFarmOrder(fo.id, "shipped", { source: "farmer", now, trackingNumber: "412345678901" });
    await expect(orders.transitionFarmOrder(fo.id, "paid", { source: "farmer", now })).rejects.toThrow();
    const done = await orders.transitionFarmOrder(fo.id, "delivered", { source: "cron", now });
    expect(done.status).toBe("delivered");
    const events = await db.select().from(s.shipmentEvents).where(eq(s.shipmentEvents.farmOrderId, fo.id));
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(["order_received", "shipped", "delivered"]));

    // second order: cancel before shipping restores stock and cancels parent
    const { order: o2 } = await orders.createOrder({ userId: me.id, email: me.email, lines: [{ variantId: v.id, quantity: 3 }], address, paymentProvider: "demo", now });
    await orders.markOrderPaid(o2.id, { now });
    await orders.cancelOrderByCustomer(o2.id, me.id, now);
    const after = await db.query.productVariants.findFirst({ where: eq(s.productVariants.id, v.id) });
    expect(after!.stock).toBe(before - 2);
    const parent = await db.query.orders.findFirst({ where: and(eq(s.orders.id, o2.id)) });
    expect(parent!.status).toBe("cancelled");
  });

  it("rejects overselling", async () => {
    const me = (await customer())!;
    const v = await pickVariant("fukura-dry-onion"); // stock 3
    await expect(
      orders.createOrder({ userId: me.id, email: me.email, lines: [{ variantId: v.id, quantity: v.stock + 1 }], address, paymentProvider: "demo", now: new Date() }),
    ).rejects.toThrow(/在庫/);
  });
});
