import { and, eq, like } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * 配達完了の判定（#25）。オーナーの決定（Issue #25 のコメント）:
 * - 業者の API が無い荷物は、お届け予定日の翌日に自動で配達完了（発送日からではない）
 * - お客さまが「受け取りました」を押せば、その場で完了
 * - 届けられなかった（持ち戻り・返送）ときは生産者と運営に知らせ、自動完了を止める
 * 業者との契約はまだなので、アダプタはテストで差し込む。
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));
vi.mock("@/server/services/email", () => ({ sendEmail: vi.fn(async () => {}) }));

type Role = "customer" | "farmer" | "admin";
let currentUser: { id: string; name: string; email: string; image: null; role: Role; twoFactorEnabled?: boolean } | null = null;
vi.mock("@/server/auth/session", () => ({ getSessionUser: async () => currentUser }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { createOrder, markOrderPaid, transitionFarmOrder } = await import("../orders");
const { syncDeliveries } = await import("../shipping/delivery");
const { trackingAdapters } = await import("../shipping/tracking");
const { confirmReceived } = await import("@/server/actions/account");
const { shippingPolicy, shippingZones } = await import("@/config/shipping");
const { addDays, toYmd } = await import("@/lib/dates");
const { zoneOf } = await import("@/lib/shipping");

const DAY = 86_400_000;
const address = { recipientName: "配達 テスト", postalCode: "5300001", prefecture: "大阪府", city: "大阪市", line1: "1", phone: "0600000000" };
const now = new Date();
const today = toYmd(now);
let buyer: typeof s.user.$inferSelect;
let variantId = "";
let seq = 0;

beforeAll(async () => {
  buyer = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!;
  const product = (await db.query.products.findFirst({ where: eq(s.products.slug, "awa-tsurigoya-tarzan"), with: { variants: true } }))!;
  variantId = product.variants[0].id;
  await db.update(s.productVariants).set({ stock: 500 }).where(eq(s.productVariants.id, variantId));
});
afterEach(() => {
  delete trackingAdapters.yamato;
});

/** 発送済みの荷物。eta を渡すとお届け予定日をその日にする */
async function shipped(opts: { eta?: string | null; shippedDaysAgo?: number } = {}) {
  const { order } = await createOrder({ userId: buyer.id, email: buyer.email, lines: [{ variantId, quantity: 1 }], address, paymentProvider: "demo", now });
  await markOrderPaid(order.id, { now });
  const [fo] = await db.select().from(s.farmOrders).where(eq(s.farmOrders.orderId, order.id));
  await transitionFarmOrder(fo.id, "shipped", { source: "farmer", now, carrier: "yamato", trackingNumber: `41234567${String(++seq).padStart(4, "0")}` });
  const patch: Partial<typeof s.farmOrders.$inferInsert> = {};
  if (opts.eta !== undefined) patch.estimatedDeliveryDate = opts.eta;
  if (opts.shippedDaysAgo !== undefined) patch.shippedAt = new Date(now.getTime() - opts.shippedDaysAgo * DAY);
  if (Object.keys(patch).length) await db.update(s.farmOrders).set(patch).where(eq(s.farmOrders.id, fo.id));
  return (await db.query.farmOrders.findFirst({ where: eq(s.farmOrders.id, fo.id) }))!;
}
const reload = async (id: string) => (await db.query.farmOrders.findFirst({ where: eq(s.farmOrders.id, id) }))!;
const lastEvent = async (id: string) => (await db.select().from(s.shipmentEvents).where(eq(s.shipmentEvents.farmOrderId, id))).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()).at(-1)!;
const adapter = (status: "in_transit" | "delivered" | "exception" | "error", detail?: string) => {
  trackingAdapters.yamato = {
    fetch: async () => {
      if (status === "error") throw new Error("tracking API down");
      return { status, at: now, detail };
    },
  };
};

describe("業者の API が無いとき（今の状態）", () => {
  it("お届け予定日の翌日に配達完了。予定日の当日はまだ", async () => {
    const onEta = await shipped({ eta: today });
    const dayAfter = await shipped({ eta: addDays(today, -shippingPolicy.autoDeliveredAfterEtaDays) });

    await syncDeliveries(now);

    expect((await reload(onEta.id)).status).toBe("shipped");
    expect((await reload(dayAfter.id)).status).toBe("delivered");
    expect((await lastEvent(dayAfter.id)).message).toBe(shippingPolicy.delivery.byEta);
  });

  it("発送から日数が経っていても、お届け予定日が先ならまだ完了にしない（遠方の荷物）", async () => {
    const fo = await shipped({ eta: addDays(today, 1), shippedDaysAgo: 10 });
    await syncDeliveries(now);
    expect((await reload(fo.id)).status).toBe("shipped");
  });

  it("お届け予定日の無い古い注文は、今までどおり発送から日数で完了", async () => {
    const fo = await shipped({ eta: null, shippedDaysAgo: shippingPolicy.autoDeliveredAfterDays + 1 });
    await syncDeliveries(now);
    expect((await reload(fo.id)).status).toBe("delivered");
  });
});

describe("発送したときのお届け予定日", () => {
  it("遅れて発送したら、実際の発送日から引き直す（すぐ完了にならない）", async () => {
    const { order } = await createOrder({ userId: buyer.id, email: buyer.email, lines: [{ variantId, quantity: 1 }], address, paymentProvider: "demo", now });
    await markOrderPaid(order.id, { now });
    const [fo] = await db.select().from(s.farmOrders).where(eq(s.farmOrders.orderId, order.id));
    await db.update(s.farmOrders).set({ estimatedDeliveryDate: addDays(today, -5) }).where(eq(s.farmOrders.id, fo.id)); // 予定より遅れた

    await transitionFarmOrder(fo.id, "shipped", { source: "farmer", now, trackingNumber: "412345670001" });

    const expected = addDays(today, shippingZones[zoneOf(address.prefecture)].transitDays);
    expect((await reload(fo.id)).estimatedDeliveryDate).toBe(expected);
    await syncDeliveries(now);
    expect((await reload(fo.id)).status).toBe("shipped");
  });

  it("お客さまの希望日など、もっと先の予定日はそのまま", async () => {
    const { order } = await createOrder({ userId: buyer.id, email: buyer.email, lines: [{ variantId, quantity: 1 }], address, paymentProvider: "demo", now });
    await markOrderPaid(order.id, { now });
    const [fo] = await db.select().from(s.farmOrders).where(eq(s.farmOrders.orderId, order.id));
    const desired = addDays(today, 12);
    await db.update(s.farmOrders).set({ estimatedDeliveryDate: desired }).where(eq(s.farmOrders.id, fo.id));
    await transitionFarmOrder(fo.id, "shipped", { source: "farmer", now, trackingNumber: "412345670002" });
    expect((await reload(fo.id)).estimatedDeliveryDate).toBe(desired);
  });
});

describe("業者の API があるとき", () => {
  it("配達完了の記録があれば、予定日前でも完了（配送業者の記録として残る）", async () => {
    const fo = await shipped({ eta: addDays(today, 2) });
    adapter("delivered");
    await syncDeliveries(now);
    expect((await reload(fo.id)).status).toBe("delivered");
    expect(await lastEvent(fo.id)).toMatchObject({ source: "carrier", message: shippingPolicy.delivery.byCarrier });
  });

  it("届けられなかった記録: 配達の問題として止め、生産者と運営に1回だけ知らせる。猶予を過ぎても自動完了しない", async () => {
    const fo = await shipped({ eta: addDays(today, -(shippingPolicy.trackingGraceDays + 1)) });
    const farm = (await db.query.farms.findFirst({ where: eq(s.farms.id, fo.farmId) }))!;
    adapter("exception", "保管期限切れのため返送");
    const noticesFor = async (userId: string) =>
      db.select().from(s.notifications).where(and(eq(s.notifications.userId, userId), like(s.notifications.title, `%${fo.code}%`)));

    await syncDeliveries(now);
    await syncDeliveries(new Date(now.getTime() + 60_000));

    const row = await reload(fo.id);
    expect(row.status).toBe("shipped");
    expect(row.deliveryIssueAt).not.toBeNull();
    expect(row.deliveryIssueNote).toContain("保管期限切れのため返送");
    expect(await noticesFor(farm.ownerId)).toHaveLength(1);
    const admin = (await db.query.user.findFirst({ where: eq(s.user.email, "admin@demo.awaji") }))!;
    expect(await noticesFor(admin.id)).toHaveLength(1);
    expect((await db.select().from(s.shipmentEvents).where(and(eq(s.shipmentEvents.farmOrderId, fo.id), eq(s.shipmentEvents.type, "exception"))))).toHaveLength(1);

    // API が無くなっても（予定日ルールでも）止まったまま
    delete trackingAdapters.yamato;
    await syncDeliveries(now);
    expect((await reload(fo.id)).status).toBe("shipped");
  });

  it("配達の問題があっても、その後に配達完了の記録が来れば完了", async () => {
    const fo = await shipped({ eta: today });
    adapter("exception");
    await syncDeliveries(now);
    adapter("delivered");
    await syncDeliveries(now);
    expect((await reload(fo.id)).status).toBe("delivered");
  });

  it("API の障害: 予定日の翌日では完了にせず、猶予を過ぎたら完了（精算を止めない）", async () => {
    adapter("error");
    const within = await shipped({ eta: addDays(today, -shippingPolicy.autoDeliveredAfterEtaDays) });
    const past = await shipped({ eta: addDays(today, -shippingPolicy.trackingGraceDays) });

    const out = await syncDeliveries(now);

    expect(out.trackingErrors).toBeGreaterThanOrEqual(2);
    expect((await reload(within.id)).status).toBe("shipped");
    expect((await reload(past.id)).status).toBe("delivered");
    expect((await lastEvent(past.id)).message).toBe(shippingPolicy.delivery.byEtaAfterTrackingError);
  });

  it("輸送中のまま猶予を過ぎたら、配達の問題にする（完了にはしない）", async () => {
    adapter("in_transit");
    const fo = await shipped({ eta: addDays(today, -shippingPolicy.trackingGraceDays) });
    const young = await shipped({ eta: addDays(today, -shippingPolicy.autoDeliveredAfterEtaDays) });
    await syncDeliveries(now);
    const row = await reload(fo.id);
    expect(row.status).toBe("shipped");
    expect(row.deliveryIssueNote).toBe(shippingPolicy.delivery.issueOverdue);
    expect((await reload(young.id)).deliveryIssueAt).toBeNull();
  });
});

describe("お客さまの「受け取りました」", () => {
  const signInAs = (u: typeof s.user.$inferSelect) => {
    currentUser = { id: u.id, name: u.name, email: u.email, image: null, role: "customer", twoFactorEnabled: true };
  };

  it("自分の発送済みの荷物はその場で完了（配達の問題があっても）", async () => {
    const fo = await shipped({ eta: addDays(today, 3) });
    await db.update(s.farmOrders).set({ deliveryIssueAt: now, deliveryIssueNote: "テスト" }).where(eq(s.farmOrders.id, fo.id));
    signInAs(buyer);
    expect(await confirmReceived(fo.id)).toMatchObject({ ok: true });
    expect((await reload(fo.id)).status).toBe("delivered");
    expect(await lastEvent(fo.id)).toMatchObject({ source: "customer", actorId: buyer.id, message: shippingPolicy.delivery.byCustomer });
  });

  it("ほかの人の荷物・まだ発送していない荷物はできない", async () => {
    const fo = await shipped({ eta: addDays(today, 3) });
    const other = (await db.query.user.findFirst({ where: (u, { and: a, eq: e, ne }) => a(e(u.role, "customer"), ne(u.id, buyer.id)) }))!;
    signInAs(other);
    expect((await confirmReceived(fo.id)).ok).toBe(false);
    expect((await reload(fo.id)).status).toBe("shipped");

    const { order } = await createOrder({ userId: buyer.id, email: buyer.email, lines: [{ variantId, quantity: 1 }], address, paymentProvider: "demo", now });
    await markOrderPaid(order.id, { now });
    const [paid] = await db.select().from(s.farmOrders).where(eq(s.farmOrders.orderId, order.id));
    signInAs(buyer);
    // 状態遷移の表（paid → delivered は無い）でも断られるが、お客さまに分かる理由で断ること
    expect(await confirmReceived(paid.id)).toMatchObject({ ok: false, error: shippingPolicy.delivery.confirmNotShipped });
    expect((await reload(paid.id)).status).toBe("paid");
  });
});
