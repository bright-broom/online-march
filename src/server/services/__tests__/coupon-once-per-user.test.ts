import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * クーポンの「お一人さま1回まで」（#21）。同じ人は2回目を使えない。キャンセルした注文は数えない（返金した注文は数える）。
 * ほかの人・この設定のないクーポンには影響しない。
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));

type Role = "customer" | "farmer" | "admin";
let currentUser: { id: string; name: string; email: string; image: null; role: Role; twoFactorEnabled?: boolean } | null = null;
vi.mock("@/server/auth/session", () => ({ getSessionUser: async () => currentUser }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { createOrder, quoteCart } = await import("../orders");
const { getCheckoutQuote } = await import("@/server/actions/checkout");
const { saveCoupon } = await import("@/server/actions/admin-content");
const { couponOncePerUserCopy } = await import("@/config/payments");

const address = { recipientName: "テスト", postalCode: "5300001", prefecture: "大阪府", city: "大阪市", line1: "1", phone: "0600000000" };
const CODE = "ONCE-PER-USER";
let variantId = "";

const userOf = async (email: string) => (await db.query.user.findFirst({ where: eq(s.user.email, email) }))!;
const buy = (userId: string, couponCode = CODE) =>
  createOrder({ userId, email: "c@x.jp", lines: [{ variantId, quantity: 1 }], address, couponCode, paymentProvider: "demo", now: new Date() })
    .then((r) => ({ ok: true as const, orderId: r.order.id }))
    .catch((e: Error) => ({ ok: false as const, error: e.message }));

beforeEach(async () => {
  const product = (await db.query.products.findFirst({ where: eq(s.products.slug, "awa-tsurigoya-tarzan"), with: { variants: true } }))!;
  variantId = product.variants[0].id;
  await db.update(s.productVariants).set({ stock: 50 }).where(eq(s.productVariants.id, variantId));
  await db.update(s.orders).set({ couponCode: null }).where(eq(s.orders.couponCode, CODE));
  await db.delete(s.coupons).where(eq(s.coupons.code, CODE));
  await db.insert(s.coupons).values({ code: CODE, description: "初回限定", type: "fixed", value: 300, minSubtotal: 0, oncePerUser: true, isActive: true });
});

describe("お一人さま1回までのクーポン", () => {
  it("同じ人の2回目は注文できない", async () => {
    const me = await userOf("customer@demo.awaji");
    expect((await buy(me.id)).ok).toBe(true);

    expect(await buy(me.id)).toEqual({ ok: false, error: couponOncePerUserCopy.used });
  });

  it("見積もり（カート・チェックアウト画面）の時点で使えないと分かる", async () => {
    const me = await userOf("customer@demo.awaji");
    currentUser = { id: me.id, name: me.name, email: me.email, image: null, role: "customer", twoFactorEnabled: true };
    await buy(me.id);

    const res = await getCheckoutQuote({ lines: [{ variantId, quantity: 1 }], prefecture: "大阪府", couponCode: CODE });

    expect(res.ok && res.data.coupon).toBeNull();
    expect(res.ok && res.data.couponError).toBe(couponOncePerUserCopy.used);
  });

  it("誰の見積もりか分からないときは割り引かない", async () => {
    const quote = await quoteCart({ lines: [{ variantId, quantity: 1 }], prefecture: "大阪府", couponCode: CODE, now: new Date() });
    expect(quote.coupon).toBeNull();
  });

  it("キャンセルした注文は数えない。返金した注文は数える", async () => {
    const me = await userOf("customer@demo.awaji");
    const first = await buy(me.id);
    await db.update(s.orders).set({ status: "cancelled" }).where(eq(s.orders.id, first.ok ? first.orderId : ""));

    const second = await buy(me.id);
    expect(second.ok).toBe(true);

    await db.update(s.orders).set({ status: "refunded" }).where(eq(s.orders.id, second.ok ? second.orderId : ""));
    expect((await buy(me.id)).ok).toBe(false);
  });

  it("ほかの人は使える", async () => {
    const a = await userOf("customer@demo.awaji");
    const b = (await db.query.user.findFirst({ where: (u, { and, eq, ne }) => and(eq(u.role, "customer"), ne(u.id, a.id)) }))!;
    expect((await buy(a.id)).ok).toBe(true);
    expect((await buy(b.id)).ok).toBe(true);
  });

  it("この設定のないクーポンは、同じ人が何度でも使える", async () => {
    const me = await userOf("customer@demo.awaji");
    await db.update(s.coupons).set({ oncePerUser: false }).where(eq(s.coupons.code, CODE));
    expect((await buy(me.id)).ok).toBe(true);
    expect((await buy(me.id)).ok).toBe(true);
  });

  // テストの PGlite はクエリを1本ずつ処理するので、本当の同時実行はここでは再現できない（createOrder の
  // pg_advisory_xact_lock と数え直しを外してもこのテストは通る）。Neon で守っているのはそのロックと数え直し。
  it("同じ人がまとめて注文しても、通るのは1件だけ", async () => {
    const me = await userOf("customer@demo.awaji");
    const results = await Promise.all([buy(me.id), buy(me.id), buy(me.id)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });
});

describe("運営のクーポン設定", () => {
  it("「お一人さま1回まで」をオン・オフして保存できる", async () => {
    const admin = await userOf("admin@demo.awaji");
    currentUser = { id: admin.id, name: admin.name, email: admin.email, image: null, role: "admin", twoFactorEnabled: true };
    const coupon = (await db.query.coupons.findFirst({ where: eq(s.coupons.code, CODE) }))!;
    const save = (on: boolean) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries({ id: coupon.id, code: CODE, description: "初回限定", type: "fixed", value: "300", minSubtotal: "0", maxUses: "", startsAt: "", endsAt: "", isActive: "on" })) fd.set(k, v);
      if (on) fd.set("oncePerUser", "on");
      return saveCoupon(null, fd);
    };
    const stored = async () => (await db.query.coupons.findFirst({ where: eq(s.coupons.id, coupon.id) }))!.oncePerUser;

    expect((await save(false)).ok).toBe(true);
    expect(await stored()).toBe(false);
    expect((await save(true)).ok).toBe(true);
    expect(await stored()).toBe(true);
  });
});
