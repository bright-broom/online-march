import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 退会。個人情報は消し、取引の記録は残す — この2つが同時に成り立つことを守る。
 * user 行を消すと注文が cascade で道連れになる（＝生産者の帳簿が消える）ので、匿名化で実現している。
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { createOrder, markOrderPaid, transitionFarmOrder } = await import("../orders");
const { closeCustomerAccount, AccountCloseBlocked, CLOSED_ACCOUNT_NAME } = await import("../account-closure");

const address = { recipientName: "退会 太郎", postalCode: "5300001", prefecture: "大阪府", city: "大阪市", line1: "1", phone: "0600000000" };
let seq = 0;

/** A customer with everything a real one accumulates: login, address book, favourite, follow, messages, a delivered order. */
async function customerWithHistory() {
  const id = `user_close_${++seq}`;
  const email = `close${seq}@awaji-marche.jp`;
  await db.insert(s.user).values({ id, name: "退会 太郎", email, role: "customer", phone: "09000000000" });
  await db.insert(s.account).values({ id: `acc_${id}`, accountId: email, providerId: "credential", userId: id, password: "hashed" });
  await db.insert(s.session).values({ id: `ses_${id}`, token: `tok_${id}`, userId: id, expiresAt: new Date(Date.now() + 86_400_000) });

  const product = (await db.query.products.findFirst({ where: eq(s.products.slug, "awa-tsurigoya-tarzan"), with: { variants: true, farm: true } }))!;
  const farm = product.farm;
  const variantId = product.variants[0].id;
  await db.update(s.productVariants).set({ stock: 50 }).where(eq(s.productVariants.id, variantId));

  await db.insert(s.addresses).values({ userId: id, label: "自宅", ...address, isDefault: true });
  await db.insert(s.favorites).values({ userId: id, productId: product.id });
  await db.insert(s.farmFollows).values({ userId: id, farmId: farm.id });
  await db.insert(s.notifications).values({ userId: id, type: "order", title: "テスト通知", body: "本文" });
  await db.insert(s.messages).values({ farmId: farm.id, customerId: id, senderId: id, body: "いつもありがとうございます" });

  const now = new Date();
  const { order } = await createOrder({ userId: id, email, lines: [{ variantId, quantity: 1 }], address, paymentProvider: "demo", now });
  await markOrderPaid(order.id, { now });
  const [fo] = await db.select().from(s.farmOrders).where(eq(s.farmOrders.orderId, order.id));
  return { id, email, orderId: order.id, farmOrderId: fo.id, farmId: farm.id, productId: product.id };
}

const deliver = async (farmOrderId: string) => {
  const now = new Date();
  await transitionFarmOrder(farmOrderId, "shipped", { source: "farmer", now, trackingNumber: "412300001234" });
  await transitionFarmOrder(farmOrderId, "delivered", { source: "cron", now });
};

const rowCounts = async (userId: string) => ({
  addresses: (await db.select().from(s.addresses).where(eq(s.addresses.userId, userId))).length,
  favorites: (await db.select().from(s.favorites).where(eq(s.favorites.userId, userId))).length,
  follows: (await db.select().from(s.farmFollows).where(eq(s.farmFollows.userId, userId))).length,
  notifications: (await db.select().from(s.notifications).where(eq(s.notifications.userId, userId))).length,
  messages: (await db.select().from(s.messages).where(eq(s.messages.customerId, userId))).length,
  sessions: (await db.select().from(s.session).where(eq(s.session.userId, userId))).length,
  credentials: (await db.select().from(s.account).where(eq(s.account.userId, userId))).length,
  orders: (await db.select().from(s.orders).where(eq(s.orders.userId, userId))).length,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("退会", () => {
  it("配送中・お支払い待ちの注文があるうちは退会できない", async () => {
    const c = await customerWithHistory(); // paid, まだ発送前

    await expect(closeCustomerAccount(c.id)).rejects.toMatchObject({ reason: "live_orders" });
    expect((await db.query.user.findFirst({ where: eq(s.user.id, c.id) }))!.deletedAt).toBeNull();

    await transitionFarmOrder(c.farmOrderId, "shipped", { source: "farmer", now: new Date(), trackingNumber: "412300005678" });
    await expect(closeCustomerAccount(c.id)).rejects.toBeInstanceOf(AccountCloseBlocked); // 配送中も同じ
  });

  it("個人情報を消し、注文とレビューは残す", async () => {
    const c = await customerWithHistory();
    await deliver(c.farmOrderId);
    await db.insert(s.reviews).values({ productId: c.productId, farmId: c.farmId, userId: c.id, farmOrderId: c.farmOrderId, rating: 5, title: "おいしい", body: "また買います" });

    await closeCustomerAccount(c.id);

    const after = (await db.query.user.findFirst({ where: eq(s.user.id, c.id) }))!;
    expect(after.deletedAt).not.toBeNull();
    expect(after.name).toBe(CLOSED_ACCOUNT_NAME);
    expect(after.email).not.toContain("awaji-marche.jp"); // 元のアドレスは残さない（再登録もできる）
    expect(after.phone).toBeNull();

    const counts = await rowCounts(c.id);
    expect(counts).toMatchObject({ addresses: 0, favorites: 0, follows: 0, notifications: 0, messages: 0, sessions: 0, credentials: 0 });
    expect(counts.orders).toBe(1); // 帳簿として残る
    const review = (await db.query.reviews.findFirst({ where: eq(s.reviews.userId, c.id) }))!;
    expect(review.body).toBe("また買います"); // 公開済みの評価は残す（表示名だけ変わる）
    const [fo] = await db.select().from(s.farmOrders).where(eq(s.farmOrders.id, c.farmOrderId));
    expect(fo.payoutAmount).toBeGreaterThan(0); // 生産者への精算額も無傷
  });

  it("二度目は退会済みとして断る", async () => {
    const c = await customerWithHistory();
    await deliver(c.farmOrderId);
    await closeCustomerAccount(c.id);

    await expect(closeCustomerAccount(c.id)).rejects.toMatchObject({ reason: "already_closed" });
  });

  it("生産者・運営のアカウントは自分では退会できない", async () => {
    const farmer = (await db.query.user.findFirst({ where: eq(s.user.role, "farmer") }))!;

    await expect(closeCustomerAccount(farmer.id)).rejects.toMatchObject({ reason: "not_customer" });
    expect((await db.query.user.findFirst({ where: eq(s.user.id, farmer.id) }))!.email).toBe(farmer.email);
  });

  it("ほかのお客さまのデータは巻き込まない", async () => {
    const a = await customerWithHistory();
    const b = await customerWithHistory();
    await deliver(a.farmOrderId);

    await closeCustomerAccount(a.id);

    const other = await rowCounts(b.id);
    expect(other).toMatchObject({ addresses: 1, favorites: 1, follows: 1, messages: 1, sessions: 1, credentials: 1, orders: 1 });
    expect(other.notifications).toBeGreaterThan(0);
    expect((await db.query.user.findFirst({ where: eq(s.user.id, b.id) }))!.deletedAt).toBeNull();
    const stillThere = await db.select().from(s.messages).where(and(eq(s.messages.customerId, b.id), eq(s.messages.senderId, b.id)));
    expect(stillThere).toHaveLength(1);
  });
});
