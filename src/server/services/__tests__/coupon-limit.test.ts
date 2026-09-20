import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { createOrder, markOrderPaid, expireUnpaidOrder } = await import("../orders");

const address = { recipientName: "テスト", postalCode: "5300001", prefecture: "大阪府", city: "大阪市", line1: "1", phone: "0600000000" };
const CODE = "RACE-LIMIT-1";
let userId = "";
let variantId = "";

const usedCount = async () => (await db.query.coupons.findFirst({ where: eq(s.coupons.code, CODE) }))!.usedCount;
const buy = async () =>
  createOrder({ userId, email: "c@x.jp", lines: [{ variantId, quantity: 1 }], address, couponCode: CODE, paymentProvider: "demo", now: new Date() })
    .then((r) => ({ ok: true as const, orderId: r.order.id }))
    .catch((e: Error) => ({ ok: false as const, error: e.message }));

beforeEach(async () => {
  userId = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!.id;
  const product = (await db.query.products.findFirst({ where: eq(s.products.slug, "awa-tsurigoya-tarzan"), with: { variants: true } }))!;
  variantId = product.variants[0].id;
  await db.update(s.productVariants).set({ stock: 50 }).where(eq(s.productVariants.id, variantId));
  await db.delete(s.coupons).where(eq(s.coupons.code, CODE));
  await db.insert(s.coupons).values({ code: CODE, description: "上限1回", type: "fixed", value: 300, minSubtotal: 0, maxUses: 1, isActive: true });
});

describe("a coupon with one use left", () => {
  it("is taken by exactly one of several simultaneous checkouts", async () => {
    const results = await Promise.all([buy(), buy(), buy(), buy(), buy()]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.error.includes("利用上限"))).toBe(true);
    expect(await usedCount()).toBe(1);
  });

  it("cannot be parked on several unpaid orders", async () => {
    const first = await buy();
    const second = await buy(); // the first order is still unpaid

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(await usedCount()).toBe(1);
  });

  it("counts the use once, not again when the order is paid", async () => {
    const order = await buy();
    if (!order.ok) throw new Error("first order should succeed");

    await markOrderPaid(order.orderId, { now: new Date() });

    expect(await usedCount()).toBe(1);
  });

  it("goes back on the shelf when the order expires unpaid", async () => {
    const order = await buy();
    if (!order.ok) throw new Error("first order should succeed");
    expect(await usedCount()).toBe(1);

    await expireUnpaidOrder(order.orderId, new Date());

    expect(await usedCount()).toBe(0);
    expect((await buy()).ok).toBe(true); // usable again
  });
});
