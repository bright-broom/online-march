import { and, eq } from "drizzle-orm";
import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * コンビニ払いのように「支払い番号が先、入金は後日」の決済手段。カード決済と違い、注文は入金まで
 * pending_payment のまま在庫だけ押さえる。番号の案内・入金確定・期限切れを Webhook 経由で通す。
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));

const SECRET = "whsec_deferred_test";
vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);

const fetchPaymentDetails = vi.fn();
vi.mock("@/server/services/payments/stripe", async (importActual) => ({
  ...(await importActual<typeof import("../payments/stripe")>()), // signature verification stays real
  fetchPaymentDetails,
}));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { createOrder } = await import("../orders");
const { POST } = await import("@/app/api/webhooks/stripe/route");

const address = { recipientName: "テスト", postalCode: "5300001", prefecture: "大阪府", city: "大阪市", line1: "1", phone: "0600000000" };
const DUE = new Date("2026-09-24T14:59:00.000Z");
const VOUCHER = "https://payments.stripe.com/konbini/voucher_test";

/** A Stripe webhook as it arrives at the route: signed body, no shortcuts. */
const deliver = async (type: string, session: Record<string, unknown>) => {
  const payload = JSON.stringify({ id: `evt_${type}`, object: "event", type, data: { object: { object: "checkout.session", ...session } } });
  const req = new Request("https://example.jp/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) },
    body: payload,
  });
  return POST(req);
};

let variantId = "";
let userId = "";

const orderOf = async (id: string) => (await db.query.orders.findFirst({ where: eq(s.orders.id, id) }))!;
const stockOf = async () => (await db.query.productVariants.findFirst({ where: eq(s.productVariants.id, variantId) }))!.stock;
const noticesOf = async (title: string) =>
  (await db.select().from(s.notifications).where(and(eq(s.notifications.userId, userId), eq(s.notifications.title, title)))).length;

const pendingOrder = async () => {
  const { order } = await createOrder({ userId, email: "c@x.jp", lines: [{ variantId, quantity: 1 }], address, paymentProvider: "stripe", now: new Date() });
  return order;
};

beforeEach(async () => {
  userId = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!.id;
  const product = (await db.query.products.findFirst({ where: eq(s.products.slug, "awa-tsurigoya-tarzan"), with: { variants: true } }))!;
  variantId = product.variants[0].id;
  await db.update(s.productVariants).set({ stock: 50 }).where(eq(s.productVariants.id, variantId));
  fetchPaymentDetails.mockReset();
  fetchPaymentDetails.mockResolvedValue({ method: "konbini", voucherUrl: VOUCHER, dueAt: DUE });
});

describe("コンビニ払い（入金待ちのある決済手段）", () => {
  it("支払い番号が出た時点では注文を確定せず、番号と期限を残して案内する", async () => {
    const order = await pendingOrder();
    const stockAfterReservation = await stockOf();
    const noticesBefore = await noticesOf("お支払い番号を発行しました");

    const res = await deliver("checkout.session.completed", { id: "cs_konbini", payment_status: "unpaid", payment_intent: "pi_konbini", metadata: { orderId: order.id } });

    expect(res.status).toBe(200);
    const after = await orderOf(order.id);
    expect(after.status).toBe("pending_payment"); // 入金前に生産者へ流さない
    expect(after.paymentMethod).toBe("konbini");
    expect(after.paymentVoucherUrl).toBe(VOUCHER);
    expect(after.paymentDueAt?.toISOString()).toBe(DUE.toISOString());
    expect(after.stripePaymentIntentId).toBe("pi_konbini");
    expect(await stockOf()).toBe(stockAfterReservation); // 在庫は押さえたまま
    expect(await noticesOf("お支払い番号を発行しました")).toBe(noticesBefore + 1);
    expect(await noticesOf("ご注文を受け付けました")).toBe(0);
  });

  it("Webhook が再送されても案内は1通だけ", async () => {
    const order = await pendingOrder();
    const body = { id: "cs_konbini_dup", payment_status: "unpaid", payment_intent: "pi_dup", metadata: { orderId: order.id } };
    const before = await noticesOf("お支払い番号を発行しました");

    await deliver("checkout.session.completed", body);
    await deliver("checkout.session.completed", body);

    expect(await noticesOf("お支払い番号を発行しました")).toBe(before + 1);
  });

  it("入金が確認できた時点で注文が確定し、支払い番号は引っ込む", async () => {
    const order = await pendingOrder();
    await deliver("checkout.session.completed", { id: "cs_k2", payment_status: "unpaid", payment_intent: "pi_k2", metadata: { orderId: order.id } });

    const res = await deliver("checkout.session.async_payment_succeeded", { id: "cs_k2", payment_status: "paid", payment_intent: "pi_k2", metadata: { orderId: order.id } });

    expect(res.status).toBe(200);
    const paid = await orderOf(order.id);
    expect(paid.status).toBe("paid");
    expect(paid.paymentMethod).toBe("konbini"); // 領収書・問い合わせのために手段を残す
    expect(paid.paymentVoucherUrl).toBeNull(); // 支払い済みの番号を出し続けない
    expect(paid.paymentDueAt).toBeNull();
    const [fo] = await db.select().from(s.farmOrders).where(eq(s.farmOrders.orderId, order.id));
    expect(fo.status).toBe("paid");
    expect(await noticesOf("ご注文を受け付けました")).toBeGreaterThan(0);
  });

  it("入金されないまま期限切れになれば注文をキャンセルし在庫を戻す", async () => {
    const order = await pendingOrder();
    const stockAfterReservation = await stockOf();
    await deliver("checkout.session.completed", { id: "cs_k3", payment_status: "unpaid", payment_intent: "pi_k3", metadata: { orderId: order.id } });

    await deliver("checkout.session.async_payment_failed", { id: "cs_k3", payment_status: "unpaid", payment_intent: "pi_k3", metadata: { orderId: order.id } });

    expect((await orderOf(order.id)).status).toBe("cancelled");
    expect(await stockOf()).toBe(stockAfterReservation + 1);
  });

  it("カードや PayPay はその場で確定する", async () => {
    const order = await pendingOrder();
    fetchPaymentDetails.mockResolvedValue({ method: "paypay", voucherUrl: null, dueAt: null });

    await deliver("checkout.session.completed", { id: "cs_paypay", payment_status: "paid", payment_intent: "pi_paypay", metadata: { orderId: order.id } });

    const paid = await orderOf(order.id);
    expect(paid.status).toBe("paid");
    expect(paid.paymentMethod).toBe("paypay");
    expect(paid.paymentVoucherUrl).toBeNull();
  });
});
