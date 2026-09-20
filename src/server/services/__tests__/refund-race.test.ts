import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));

const refundPayment = vi.fn(async () => ({ id: "re_test" }));
vi.mock("@/server/services/payments/stripe", () => ({ refundPayment }));

vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy"); // features.stripe is read when the modules below load

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { createOrder, markOrderPaid, transitionFarmOrder } = await import("../orders");
const { refundOrder } = await import("../refunds");

const address = { recipientName: "テスト", postalCode: "5300001", prefecture: "大阪府", city: "大阪市", line1: "1", phone: "0600000000" };

/** A paid, delivered order paid through Stripe — the state an admin refunds from. */
const paidOrder = async (lines: { variantId: string; quantity: number }[]) => {
  const userId = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!.id;
  const now = new Date();
  const { order } = await createOrder({ userId, email: "c@x.jp", lines, address, paymentProvider: "stripe", now });
  await db.update(s.orders).set({ stripePaymentIntentId: `pi_${order.id.slice(0, 8)}` }).where(eq(s.orders.id, order.id));
  await markOrderPaid(order.id, { paymentIntentId: `pi_${order.id.slice(0, 8)}`, now });
  const fos = await db.select().from(s.farmOrders).where(eq(s.farmOrders.orderId, order.id));
  for (const fo of fos) {
    await transitionFarmOrder(fo.id, "shipped", { source: "farmer", now, trackingNumber: "412377777777" });
    await transitionFarmOrder(fo.id, "delivered", { source: "cron", now });
  }
  return { orderId: order.id, farmOrderIds: fos.map((f) => f.id), userId };
};

const refundEvents = async (farmOrderId: string) =>
  (await db.select().from(s.shipmentEvents).where(and(eq(s.shipmentEvents.farmOrderId, farmOrderId), eq(s.shipmentEvents.type, "refund")))).length;
const refundNotices = async (userId: string) =>
  (await db.select().from(s.notifications).where(eq(s.notifications.userId, userId))).filter((n) => n.title === "返金手続きが完了しました").length;

let variantA = "";
let variantB = "";

beforeEach(async () => {
  refundPayment.mockClear();
  refundPayment.mockImplementation(async () => ({ id: "re_test" }));
  const a = (await db.query.products.findFirst({ where: eq(s.products.slug, "awa-tsurigoya-tarzan"), with: { variants: true } }))!;
  const b = (await db.query.products.findFirst({ where: eq(s.products.slug, "matsuho-momiji3"), with: { variants: true } }))!;
  variantA = a.variants[0].id;
  variantB = b.variants[0].id;
  for (const id of [variantA, variantB]) await db.update(s.productVariants).set({ stock: 50 }).where(eq(s.productVariants.id, id));
});

describe("refunding the same order twice", () => {
  it("pays out once and tells the customer once when two operators press refund together", async () => {
    const { orderId, farmOrderIds, userId } = await paidOrder([{ variantId: variantA, quantity: 1 }]);
    const noticesBefore = await refundNotices(userId);

    const results = await Promise.all([
      refundOrder({ orderId }).then(() => "ok").catch((e: Error) => e.message),
      refundOrder({ orderId }).then(() => "ok").catch((e: Error) => e.message),
    ]);

    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(results.find((r) => r !== "ok")).toContain("返金");
    expect(refundPayment).toHaveBeenCalledTimes(1);
    expect(await refundEvents(farmOrderIds[0])).toBe(1); // one line on the customer's timeline
    expect(await refundNotices(userId)).toBe(noticesBefore + 1);
    const [fo] = await db.select().from(s.farmOrders).where(eq(s.farmOrders.id, farmOrderIds[0]));
    expect(fo.refundedAt).not.toBeNull();
    expect((await db.query.orders.findFirst({ where: eq(s.orders.id, orderId) }))!.status).toBe("refunded");
  });

  it("refuses a second refund afterwards", async () => {
    const { orderId } = await paidOrder([{ variantId: variantA, quantity: 1 }]);
    await refundOrder({ orderId });

    await expect(refundOrder({ orderId })).rejects.toThrow("返金済み");
    expect(refundPayment).toHaveBeenCalledTimes(1);
  });

  it("still refunds each farm order of a multi-farm order exactly once", async () => {
    const { orderId, farmOrderIds } = await paidOrder([
      { variantId: variantA, quantity: 1 },
      { variantId: variantB, quantity: 1 },
    ]);
    expect(farmOrderIds).toHaveLength(2);

    const results = await Promise.all(farmOrderIds.map((farmOrderId) => refundOrder({ orderId, farmOrderId }).then(() => "ok").catch((e: Error) => e.message)));

    expect(results).toEqual(["ok", "ok"]); // different farms, different money — both go through
    expect(refundPayment).toHaveBeenCalledTimes(2);
    for (const id of farmOrderIds) expect(await refundEvents(id)).toBe(1);
  });

  it("leaves the order refundable when Stripe rejects the refund", async () => {
    const { orderId, farmOrderIds } = await paidOrder([{ variantId: variantA, quantity: 1 }]);
    refundPayment.mockRejectedValueOnce(new Error("card_declined"));

    await expect(refundOrder({ orderId })).rejects.toThrow("card_declined");

    const [fo] = await db.select().from(s.farmOrders).where(eq(s.farmOrders.id, farmOrderIds[0]));
    expect(fo.refundedAt).toBeNull(); // the claim was released, so the operator can try again
    expect(await refundEvents(farmOrderIds[0])).toBe(0);

    await expect(refundOrder({ orderId })).resolves.toMatchObject({ demo: false });
  });
});
