import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { createOrder, cancelOrderByCustomer } = await import("../orders");

const address = { recipientName: "テスト", postalCode: "5300001", prefecture: "大阪府", city: "大阪市", line1: "1", phone: "0600000000" };
let userId = "";
let variantId = "";

const stockOf = async () => (await db.query.productVariants.findFirst({ where: eq(s.productVariants.id, variantId) }))!.stock;
const buyOne = async () =>
  createOrder({ userId, email: "c@x.jp", lines: [{ variantId, quantity: 1 }], address, paymentProvider: "demo", now: new Date() })
    .then((r) => ({ ok: true as const, orderId: r.order.id }))
    .catch((e: Error) => ({ ok: false as const, error: e.message }));

beforeEach(async () => {
  userId = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!.id;
  const product = (await db.query.products.findFirst({ where: eq(s.products.slug, "awa-tsurigoya-tarzan"), with: { variants: true } }))!;
  variantId = product.variants[0].id;
});

describe("concurrent checkout on the last units of stock", () => {
  it("never sells more than the shelf holds", async () => {
    await db.update(s.productVariants).set({ stock: 3 }).where(eq(s.productVariants.id, variantId));

    const results = await Promise.all(Array.from({ length: 8 }, buyOne)); // 8 shoppers, 3 units

    const sold = results.filter((r) => r.ok);
    const refused = results.filter((r) => !r.ok);
    expect(sold).toHaveLength(3);
    expect(refused).toHaveLength(5);
    expect(refused.every((r) => !r.ok && r.error.includes("在庫が不足"))).toBe(true);
    expect(await stockOf()).toBe(0); // never negative, never short-changed
  });

  it("gives the stock back when a race loser's order is cancelled", async () => {
    await db.update(s.productVariants).set({ stock: 2 }).where(eq(s.productVariants.id, variantId));

    const results = await Promise.all([buyOne(), buyOne(), buyOne()]);
    const sold = results.filter((r) => r.ok);
    expect(sold).toHaveLength(2);
    expect(await stockOf()).toBe(0);

    for (const order of sold) if (order.ok) await cancelOrderByCustomer(order.orderId, userId, new Date());

    expect(await stockOf()).toBe(2); // back on the shelf, exactly once per cancelled order
  });

  it("keeps a multi-unit order all-or-nothing", async () => {
    await db.update(s.productVariants).set({ stock: 4 }).where(eq(s.productVariants.id, variantId));

    const [big, small] = await Promise.all([
      createOrder({ userId, email: "c@x.jp", lines: [{ variantId, quantity: 3 }], address, paymentProvider: "demo", now: new Date() }).then(() => "ok").catch((e: Error) => e.message),
      createOrder({ userId, email: "c@x.jp", lines: [{ variantId, quantity: 3 }], address, paymentProvider: "demo", now: new Date() }).then(() => "ok").catch((e: Error) => e.message),
    ]);

    expect([big, small].filter((r) => r === "ok")).toHaveLength(1); // 4 units cannot cover two 3-unit orders
    expect(await stockOf()).toBe(1); // the loser took nothing, not a partial reservation
    const orphaned = await db.execute<{ n: number }>(sql`select count(*)::int as n from order_items oi left join orders o on o.id = (select order_id from farm_orders where id = oi.farm_order_id) where o.id is null`);
    expect(Number(orphaned.rows[0].n)).toBe(0); // a rolled-back order leaves no rows behind
  });
});
