import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Stripe の決済画面で「戻る」を押したお客さま（#17）。未払いの注文が期限（60分）まで在庫とクーポンを押さえたままに
 * ならないよう、戻ってきた時点で取り消す。ただし支払い済み・コンビニ払いの番号発行済みの注文は取り消さない。
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { abandonCheckout, createOrder } = await import("../orders");

const address = { recipientName: "テスト", postalCode: "5300001", prefecture: "大阪府", city: "大阪市", line1: "1", phone: "0600000000" };
const CODE = "ABANDON-1";
let userId = "";
let variantId = "";

const stock = async () => (await db.query.productVariants.findFirst({ where: eq(s.productVariants.id, variantId) }))!.stock;
const usedCount = async () => (await db.query.coupons.findFirst({ where: eq(s.coupons.code, CODE) }))!.usedCount;
const order = async (id: string) => (await db.query.orders.findFirst({ where: eq(s.orders.id, id) }))!;
const place = async () => {
  const { order: o } = await createOrder({ userId, email: "c@x.jp", lines: [{ variantId, quantity: 2 }], address, couponCode: CODE, paymentProvider: "stripe", now: new Date() });
  await db.update(s.orders).set({ stripeSessionId: `cs_${o.id}` }).where(eq(s.orders.id, o.id));
  return order(o.id);
};

beforeEach(async () => {
  userId = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!.id;
  const product = (await db.query.products.findFirst({ where: eq(s.products.slug, "awa-tsurigoya-tarzan"), with: { variants: true } }))!;
  variantId = product.variants[0].id;
  await db.update(s.productVariants).set({ stock: 10 }).where(eq(s.productVariants.id, variantId));
  await db.delete(s.coupons).where(eq(s.coupons.code, CODE));
  await db.insert(s.coupons).values({ code: CODE, description: "上限1回", type: "fixed", value: 300, minSubtotal: 0, maxUses: 1, isActive: true });
});

describe("決済画面から戻ってきた注文", () => {
  it("すぐ取り消して在庫とクーポンを戻し、先に Stripe の決済画面を閉じる", async () => {
    const o = await place();
    expect(await stock()).toBe(8);
    expect(await usedCount()).toBe(1);
    const resolve = vi.fn(async () => ({ kind: "expired" as const }));

    expect(await abandonCheckout(o, new Date(), resolve)).toEqual({ kind: "cancelled" });

    expect(resolve).toHaveBeenCalledWith(o.stripeSessionId);
    expect((await order(o.id)).status).toBe("cancelled");
    expect(await stock()).toBe(10);
    expect(await usedCount()).toBe(0);
    const [fo] = await db.select().from(s.farmOrders).where(eq(s.farmOrders.orderId, o.id));
    const events = await db.select().from(s.shipmentEvents).where(eq(s.shipmentEvents.farmOrderId, fo.id));
    expect(events.some((e) => e.source === "customer" && e.message === "お客さまが決済画面でお支払いをやめたため取り消しました")).toBe(true);
  });

  it("支払いが済んでいた注文は取り消さない", async () => {
    const o = await place();

    expect(await abandonCheckout(o, new Date(), async () => ({ kind: "paid" }))).toEqual({ kind: "paid" });
    expect((await order(o.id)).status).toBe("pending_payment");
    expect(await stock()).toBe(8);
  });

  it("コンビニ払いの番号を受け取った注文は取り消さない", async () => {
    const o = await place();

    expect(await abandonCheckout(o, new Date(), async () => ({ kind: "awaiting_async" }))).toEqual({ kind: "awaiting_payment" });
    expect((await order(o.id)).status).toBe("pending_payment");
    expect(await usedCount()).toBe(1);
  });

  it("Stripe に確かめられないときは取り消さない", async () => {
    const o = await place();

    await expect(abandonCheckout(o, new Date(), async () => { throw new Error("stripe down"); })).rejects.toThrow("stripe down");
    expect((await order(o.id)).status).toBe("pending_payment");
  });

  it("二度戻ってきても二重に在庫を戻さない", async () => {
    const o = await place();
    const resolve = async () => ({ kind: "expired" as const });
    await abandonCheckout(o, new Date(), resolve);

    expect(await abandonCheckout(await order(o.id), new Date(), resolve)).toEqual({ kind: "not_pending" });
    expect(await stock()).toBe(10);
  });

  it("デモ環境（Stripe 未設定）でも取り消す", async () => {
    const o = await place();

    expect(await abandonCheckout(o, new Date(), null)).toEqual({ kind: "cancelled" });
    expect(await stock()).toBe(10);
  });
});
