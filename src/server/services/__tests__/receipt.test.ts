import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));
vi.mock("@/server/services/email", () => ({ sendEmail: vi.fn() }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { createOrder, markOrderPaid } = await import("../orders");
const { refundOrder } = await import("../refunds");
const { getOrderSummary } = await import("@/server/queries/account");
const { receiptAmounts } = await import("@/lib/receipt");

const address = { recipientName: "領収 テスト", postalCode: "6560000", prefecture: "兵庫県", city: "南あわじ市", line1: "1", phone: "0799000000" };
const variantOf = async (slug: string) => (await db.query.products.findFirst({ where: eq(s.products.slug, slug), with: { variants: true } }))!.variants[0];

async function paidTwoFarmOrder() {
  const me = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!;
  const lines = await Promise.all(["matsuho-momiji3", "shichi-shojo-aka"].map(async (slug) => ({ variantId: (await variantOf(slug)).id, quantity: 1 })));
  const { order } = await createOrder({ userId: me.id, email: me.email, lines, address, paymentProvider: "demo", now: new Date() });
  await markOrderPaid(order.id, { now: new Date() });
  const fos = await db.select().from(s.farmOrders).where(eq(s.farmOrders.orderId, order.id));
  return { userId: me.id, orderId: order.id, total: order.total, fos };
}

describe("領収書の金額", () => {
  it("返金が無ければ支払額そのまま", async () => {
    const { userId, orderId, total } = await paidTwoFarmOrder();
    expect(receiptAmounts((await getOrderSummary(userId, orderId))!)).toEqual({ paid: total, refunded: 0, received: total });
  });

  it("一部の農家分だけ返金したら、お受け取りした額（支払額 − 返金額）で発行する", async () => {
    const { userId, orderId, total, fos } = await paidTwoFarmOrder();
    const { amount } = await refundOrder({ orderId, farmOrderId: fos[0].id });
    const order = (await getOrderSummary(userId, orderId))!;
    expect(order.status).toBe("paid"); // 一部返金なので注文は支払い済みのまま
    expect(receiptAmounts(order)).toEqual({ paid: total, refunded: amount, received: total - amount });
  });

  it("全額返金したら領収書は発行しない", async () => {
    const { userId, orderId } = await paidTwoFarmOrder();
    await refundOrder({ orderId });
    expect(receiptAmounts((await getOrderSummary(userId, orderId))!)).toBeNull();
  });

  it("未払いの注文は発行しない", () => {
    expect(receiptAmounts({ status: "pending_payment", paidAt: null, total: 3000, farmOrders: [] })).toBeNull();
  });
});
