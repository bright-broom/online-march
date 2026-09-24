import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));

const refundPayment = vi.fn(async () => ({ id: "re_test" }));
vi.mock("@/server/services/payments/stripe", () => ({ refundPayment, cancelPaymentIntent: vi.fn() }));
const sendEmail = vi.fn(async () => {});
vi.mock("@/server/services/email", () => ({ sendEmail }));

vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy"); // features.stripe is read when the modules below load

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { createOrder, markOrderPaid, cancelOrderByCustomer, expireUnpaidOrder, transitionFarmOrder } = await import("../orders");
const { cancelFarmOrderAsFarmer } = await import("../refunds");

const address = { recipientName: "取消 テスト", postalCode: "6560000", prefecture: "兵庫県", city: "南あわじ市", line1: "1", phone: "0799000000" };

let userId = "";
let variantId = "";
let farmId = "";

/** Stripe で支払い済みの注文（まだ発送前） */
async function paidOrder(quantity = 1) {
  const now = new Date();
  const { order } = await createOrder({ userId, email: "cancel@x.jp", lines: [{ variantId, quantity }], address, paymentProvider: "stripe", now });
  const pi = `pi_${order.id.slice(0, 8)}`;
  await db.update(s.orders).set({ stripePaymentIntentId: pi }).where(eq(s.orders.id, order.id));
  await markOrderPaid(order.id, { paymentIntentId: pi, now });
  const [fo] = await db.select().from(s.farmOrders).where(eq(s.farmOrders.orderId, order.id));
  return { order, fo, pi };
}

const stock = async () => (await db.query.productVariants.findFirst({ where: eq(s.productVariants.id, variantId) }))!.stock;
const farmOrder = async (id: string) => (await db.query.farmOrders.findFirst({ where: eq(s.farmOrders.id, id) }))!;
const orderOf = async (id: string) => (await db.query.orders.findFirst({ where: eq(s.orders.id, id) }))!;
const sentSubjects = () => (sendEmail.mock.calls as unknown as [{ subject: string; to: string }][]).map(([m]) => m.subject);

beforeEach(async () => {
  refundPayment.mockClear();
  sendEmail.mockClear();
  userId = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!.id;
  const product = (await db.query.products.findFirst({ where: eq(s.products.slug, "awa-tsurigoya-tarzan"), with: { variants: true } }))!;
  variantId = product.variants[0].id;
  farmId = product.farmId;
  await db.update(s.productVariants).set({ stock: 50 }).where(eq(s.productVariants.id, variantId));
});

describe("生産者によるキャンセル", () => {
  it("支払い済みなら、在庫を戻したうえでお客さまへ返金し、返金を記録してメールで知らせる", async () => {
    const { order, fo, pi } = await paidOrder(2);
    const before = await stock();

    const r = await cancelFarmOrderAsFarmer({ farmOrderId: fo.id, farmId, reason: "天候不良で収穫できなかった", now: new Date() });

    const amount = fo.subtotal + fo.shippingFee - fo.discount;
    expect(r).toEqual({ refunded: amount });
    expect(refundPayment).toHaveBeenCalledWith(pi, amount, `farm-order:${fo.id}`);
    const after = await farmOrder(fo.id);
    expect(after.status).toBe("cancelled");
    expect(after.refundedAt).toBeInstanceOf(Date);
    expect(after.refundAmount).toBe(amount);
    expect(await stock()).toBe(before + 2);
    expect((await orderOf(order.id)).status).toBe("refunded");
    // タイムラインには生産者の操作として残る
    const events = await db.select().from(s.shipmentEvents).where(and(eq(s.shipmentEvents.farmOrderId, fo.id), eq(s.shipmentEvents.type, "refund")));
    expect(events.map((e) => e.source)).toEqual(["farmer"]);
    expect(sentSubjects()).toContain(`【返金のお知らせ】注文番号 ${order.code}`);
  });

  it("二度押しても返金は1回だけ", async () => {
    const { fo } = await paidOrder();
    await cancelFarmOrderAsFarmer({ farmOrderId: fo.id, farmId, reason: "在庫切れ", now: new Date() });
    await expect(cancelFarmOrderAsFarmer({ farmOrderId: fo.id, farmId, reason: "在庫切れ", now: new Date() })).rejects.toThrow();
    expect(refundPayment).toHaveBeenCalledTimes(1);
  });

  it("他の農園の注文はキャンセルできない", async () => {
    const { fo } = await paidOrder();
    const other = (await db.query.farms.findMany()).find((f) => f.id !== farmId)!;
    await expect(cancelFarmOrderAsFarmer({ farmOrderId: fo.id, farmId: other.id, reason: "x", now: new Date() })).rejects.toThrow(/見つかりません/);
    expect(refundPayment).not.toHaveBeenCalled();
    expect((await farmOrder(fo.id)).status).toBe("paid");
  });

  it("発送後はキャンセルも返金もしない", async () => {
    const { fo } = await paidOrder();
    await transitionFarmOrder(fo.id, "shipped", { source: "farmer", now: new Date(), trackingNumber: "412399999999" });
    await expect(cancelFarmOrderAsFarmer({ farmOrderId: fo.id, farmId, reason: "x", now: new Date() })).rejects.toThrow();
    expect(refundPayment).not.toHaveBeenCalled();
  });
});

describe("お客さまによるキャンセル", () => {
  it("支払い済みなら全額を返金し、出荷単位ごとに返金を記録してメールで知らせる", async () => {
    const { order, fo, pi } = await paidOrder();
    await cancelOrderByCustomer(order.id, userId, new Date());

    expect(refundPayment).toHaveBeenCalledWith(pi, undefined, `order:${order.id}`);
    expect((await orderOf(order.id)).status).toBe("refunded");
    const after = await farmOrder(fo.id);
    expect(after.status).toBe("cancelled");
    expect(after.refundedAt).toBeInstanceOf(Date); // 売上明細CSVの「返金日」が埋まる
    expect(after.refundAmount).toBe(fo.subtotal + fo.shippingFee - fo.discount);
    expect(sentSubjects()).toContain(`【返金のお知らせ】注文番号 ${order.code}`);
  });
});

describe("お支払い期限切れ", () => {
  async function unpaidOrder(dueAt: Date | null) {
    const now = new Date();
    const { order } = await createOrder({ userId, email: "expire@x.jp", lines: [{ variantId, quantity: 1 }], address, paymentProvider: "stripe", now });
    if (dueAt) await db.update(s.orders).set({ paymentDueAt: dueAt }).where(eq(s.orders.id, order.id));
    return order;
  }

  it("お支払い番号を受け取った人（コンビニ払い）にはキャンセルをメールで知らせる", async () => {
    const order = await unpaidOrder(new Date());
    await expireUnpaidOrder(order.id, new Date());
    expect((await orderOf(order.id)).status).toBe("cancelled");
    expect(sentSubjects()).toEqual([`【ご注文キャンセルのお知らせ】注文番号 ${order.code}`]);
  });

  it("決済画面を閉じただけの人にはメールを送らない", async () => {
    const order = await unpaidOrder(null);
    await expireUnpaidOrder(order.id, new Date());
    expect((await orderOf(order.id)).status).toBe("cancelled");
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
