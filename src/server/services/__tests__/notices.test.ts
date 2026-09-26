import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 案内・通知（#21）。在庫わずかのお知らせ、出荷期限を過ぎた注文の毎日のリマインド、メッセージ・レビュー返信・振込完了のメール。
 * どれも「知らせる」と約束しているのに届いていなかったもの。知らせすぎ（同じことを何度も）にならないことも確かめる。
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));
const sendEmail = vi.fn(async (_m: { to: string; subject: string }) => {});
vi.mock("@/server/services/email", () => ({ sendEmail }));

type Role = "customer" | "farmer" | "admin";
let currentUser: { id: string; name: string; email: string; image: null; role: Role; twoFactorEnabled?: boolean } | null = null;
vi.mock("@/server/auth/session", () => ({ getSessionUser: async () => currentUser }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { createOrder, markOrderPaid } = await import("../orders");
const { runJob } = await import("@/server/jobs");
const { sendMessage } = await import("@/server/actions/messages");
const { replyToReview } = await import("@/server/actions/reviews");
const { executeDuePayouts } = await import("../payouts");
const { catalogLimits } = await import("@/config/catalog");
const { toYmd, addDays } = await import("@/lib/dates");

const address = { recipientName: "通知 テスト", postalCode: "5300001", prefecture: "大阪府", city: "大阪市", line1: "1", phone: "0600000000" };
const signIn = async (email: string, role: Role) => {
  const u = (await db.query.user.findFirst({ where: eq(s.user.email, email) }))!;
  currentUser = { id: u.id, name: u.name, email: u.email, image: null, role, twoFactorEnabled: true };
  return u;
};
const mailsTo = (to: string) => sendEmail.mock.calls.map(([m]) => m).filter((m) => m.to === to);

beforeEach(() => {
  sendEmail.mockClear();
});

describe("在庫わずかのお知らせ", () => {
  it("注文でしきい値を下回った規格だけ、生産者に1回知らせる。0 になったら売り切れと知らせる", async () => {
    const buyer = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!;
    const product = (await db.query.products.findFirst({ where: eq(s.products.slug, "awa-tsurigoya-tarzan"), with: { variants: true, farm: true } }))!;
    const variant = product.variants[0];
    const T = catalogLimits.lowStockThreshold;
    await db.update(s.productVariants).set({ stock: T + 1 }).where(eq(s.productVariants.id, variant.id));
    await db.delete(s.notifications).where(and(eq(s.notifications.userId, product.farm.ownerId), eq(s.notifications.type, "product")));
    const buy = (quantity: number) => createOrder({ userId: buyer.id, email: buyer.email, lines: [{ variantId: variant.id, quantity }], address, paymentProvider: "demo", now: new Date() });
    const notes = async () => db.select().from(s.notifications).where(and(eq(s.notifications.userId, product.farm.ownerId), eq(s.notifications.type, "product")));

    await buy(1); // T+1 → T
    expect((await notes()).map((n) => n.title)).toEqual([expect.stringContaining(`残り${T}点`)]);
    await buy(1); // T → T-1: already below, no second notice
    expect(await notes()).toHaveLength(1);
    await buy(T - 1); // → 0
    expect((await notes()).at(-1)!.title).toContain("売り切れ");
  });
});

describe("出荷期限を過ぎた注文のリマインド", () => {
  it("発送されるまで毎日1回（同じ日に2回は送らない）", async () => {
    const buyer = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!;
    const product = (await db.query.products.findFirst({ where: eq(s.products.slug, "fukura-onion-soup"), with: { variants: true } }))!;
    const now = new Date();
    const { order } = await createOrder({ userId: buyer.id, email: buyer.email, lines: [{ variantId: product.variants[0].id, quantity: 1 }], address, paymentProvider: "demo", now });
    await markOrderPaid(order.id, { now });
    const [fo] = await db.select().from(s.farmOrders).where(eq(s.farmOrders.orderId, order.id));
    // 期限は2日前、前回のリマインドは昨日
    await db.update(s.farmOrders).set({ shipByDate: addDays(toYmd(now), -2), reminderSentAt: new Date(now.getTime() - 86_400_000) }).where(eq(s.farmOrders.id, fo.id));
    const reminded = async () => (await db.query.farmOrders.findFirst({ where: eq(s.farmOrders.id, fo.id) }))!.reminderSentAt!.getTime();
    const before = await reminded();

    expect((await runJob("ship-reminders", "manual", now)).ok).toBe(true);
    const first = await reminded();
    expect(first).toBeGreaterThan(before);
    expect(sendEmail.mock.calls.some(([m]) => m.subject.includes("出荷期限を過ぎた"))).toBe(true);

    const mailsAfterFirst = sendEmail.mock.calls.length;
    await runJob("ship-reminders", "manual", new Date(now.getTime() + 60_000)); // 同じ日のうちにもう一度
    expect(await reminded()).toBe(first);
    expect(sendEmail.mock.calls.length).toBe(mailsAfterFirst);
  });
});

describe("メールでのお知らせ", () => {
  it("メッセージ: 届いたらメール。同じやり取りで続けて届いた分は30分メールしない", async () => {
    const customer = await signIn("customer@demo.awaji", "customer");
    const farm = (await db.query.farms.findFirst({ where: eq(s.farms.slug, "awa-farm"), with: { owner: true } }))!;
    await db.delete(s.notifications).where(and(eq(s.notifications.userId, farm.ownerId), eq(s.notifications.type, "message")));

    await sendMessage({ farmId: farm.id, body: "注文した玉ねぎの保存方法を教えてください" });
    await sendMessage({ farmId: farm.id, body: "あと、冷蔵庫でも大丈夫ですか？" });
    expect(mailsTo(farm.owner.email)).toHaveLength(1);
    expect(mailsTo(farm.owner.email)[0].subject).toContain(customer.name);

    // 30分たったことにする
    await db.update(s.notifications).set({ createdAt: new Date(Date.now() - 31 * 60_000) }).where(eq(s.notifications.userId, farm.ownerId));
    await sendMessage({ farmId: farm.id, body: "よろしくお願いします" });
    expect(mailsTo(farm.owner.email)).toHaveLength(2);
  });

  it("レビューへの返信: 書いた人にお知らせとメール。返信を直したときは送らない", async () => {
    const owner = await signIn("farmer@demo.awaji", "farmer");
    const farm = (await db.query.farms.findFirst({ where: eq(s.farms.ownerId, owner.id) }))!;
    const review = (await db.query.reviews.findFirst({ where: eq(s.reviews.farmId, farm.id) }))!;
    await db.update(s.reviews).set({ reply: null, repliedAt: null }).where(eq(s.reviews.id, review.id));
    const author = (await db.query.user.findFirst({ where: eq(s.user.id, review.userId) }))!;

    expect((await replyToReview({ reviewId: review.id, reply: "ご購入ありがとうございます！" })).ok).toBe(true);
    expect(mailsTo(author.email).map((m) => m.subject)).toEqual([expect.stringContaining("レビューへの返信")]);
    expect((await db.select().from(s.notifications).where(eq(s.notifications.userId, author.id))).some((n) => n.title.includes("レビューに返信"))).toBe(true);

    await replyToReview({ reviewId: review.id, reply: "ご購入ありがとうございます！またお待ちしています。" });
    expect(mailsTo(author.email)).toHaveLength(1);
  });

  it("振込完了: 生産者にメール", async () => {
    const farm = (await db.query.farms.findFirst({ where: eq(s.farms.slug, "awa-farm"), with: { owner: true } }))!;
    await db.update(s.farms).set({ stripeAccountId: "acct_notice", stripeOnboarded: true }).where(eq(s.farms.id, farm.id));
    await db.update(s.payouts).set({ status: "paid" }).where(eq(s.payouts.status, "pending"));
    await db.insert(s.payouts).values({ farmId: farm.id, periodStart: "2026-08-01", periodEnd: "2026-08-31", grossSales: 4200, shippingFees: 0, commission: 0, amount: 4200, orderCount: 1, scheduledFor: toYmd(new Date()) });

    await executeDuePayouts(new Date(), { isReady: async () => true, availableBalance: async () => 10_000, transfer: async () => ({ id: "tr_notice" }), findTransfer: async () => null });

    expect(mailsTo(farm.owner.email).map((m) => m.subject)).toEqual([expect.stringContaining("お振込完了")]);
  });
});
