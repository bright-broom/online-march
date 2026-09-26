import { eq, ne, and } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Cross-tenant checks: the guards decide *who* is calling, but each action must also prove the row it is
 * about to touch belongs to that caller. These tests sign in as one farmer / customer and aim every
 * mutating action at somebody else's data.
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));

let currentUser: { id: string; name: string; email: string; image: null; role: "customer" | "farmer" | "admin"; twoFactorEnabled?: boolean } | null = null;
vi.mock("@/server/auth/session", () => ({ getSessionUser: async () => currentUser }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const farmerProducts = await import("../farmer-products");
const farmerOrders = await import("../farmer-orders");
const account = await import("../account");
const adminOps = await import("../admin-ops");
const messages = await import("../messages");
const reviews = await import("../reviews");
const checkout = await import("../checkout");
const farmStaff = await import("../farm-staff");
const { createOrder } = await import("@/server/services/orders");

const signIn = async (email: string, role: "customer" | "farmer" | "admin") => {
  const u = (await db.query.user.findFirst({ where: eq(s.user.email, email) }))!;
  currentUser = { id: u.id, name: u.name, email: u.email, image: null, role };
};

describe("cross-tenant authorization", () => {
  let mine: typeof s.farms.$inferSelect;
  let theirs: typeof s.farms.$inferSelect;

  beforeAll(async () => {
    mine = (await db.query.farms.findFirst({ where: eq(s.farms.slug, "awa-farm") }))!;
    theirs = (await db.query.farms.findFirst({ where: and(ne(s.farms.id, mine.id), eq(s.farms.status, "active")) }))!;
  });

  it("a farmer cannot edit another farm's product", async () => {
    await signIn("farmer@demo.awaji", "farmer");
    const victim = (await db.query.products.findFirst({ where: eq(s.products.farmId, theirs.id) }))!;
    const form = new FormData();
    form.set("id", victim.id);
    form.set("name", "乗っ取り");
    form.set("category", victim.category);
    form.set("variety", victim.variety ?? "");
    form.set("summary", victim.summary);
    form.set("description", victim.description);
    form.set("cultivation", victim.cultivation);
    form.set("status", "active");

    const res = await farmerProducts.saveProduct(null, form);

    expect(res.ok).toBe(false);
    expect((await db.query.products.findFirst({ where: eq(s.products.id, victim.id) }))!.name).toBe(victim.name);
  });

  it("a farmer cannot ship another farm's order", async () => {
    await signIn("farmer@demo.awaji", "farmer");
    const victim = (await db.query.farmOrders.findFirst({ where: eq(s.farmOrders.farmId, theirs.id) }))!;

    const res = await farmerOrders.shipOrder({ id: victim.id, trackingNumber: "412300000000", carrier: "yamato" });
    const bulk = await farmerOrders.startPreparing([victim.id]);
    const payout = victim.payoutId ? await farmerOrders.fetchPayoutOrders(victim.payoutId) : null;

    expect(res.ok).toBe(false);
    expect(bulk.ok && bulk.data.done).toBeFalsy(); // a bulk call must not slip past the ownership filter
    if (payout) expect(payout.ok && payout.data.length).toBeFalsy(); // nor may they read another farm's payout detail
    const after = (await db.query.farmOrders.findFirst({ where: eq(s.farmOrders.id, victim.id) }))!;
    expect(after.status).toBe(victim.status);
    expect(after.trackingNumber).toBe(victim.trackingNumber);
  });

  it("a customer cannot abandon somebody else's unpaid checkout", async () => {
    const other = (await db.query.user.findFirst({ where: eq(s.user.email, "sato@example.jp") }))!;
    const product = (await db.query.products.findFirst({ where: eq(s.products.slug, "awa-tsurigoya-tarzan"), with: { variants: true } }))!;
    const address = { recipientName: "テスト", postalCode: "5300001", prefecture: "大阪府", city: "大阪市", line1: "1", phone: "0600000000" };
    const { order } = await createOrder({ userId: other.id, email: other.email, lines: [{ variantId: product.variants[0].id, quantity: 1 }], address, paymentProvider: "stripe", now: new Date() });
    await signIn("customer@demo.awaji", "customer");

    const res = await checkout.cancelAbandonedCheckout({ orderId: order.id });

    expect(res.ok).toBe(false);
    expect((await db.query.orders.findFirst({ where: eq(s.orders.id, order.id) }))!.status).toBe("pending_payment");
  });

  it("a customer cannot cancel somebody else's order", async () => {
    const other = (await db.query.user.findFirst({ where: eq(s.user.email, "sato@example.jp") }))!;
    const victim = (await db.query.orders.findFirst({ where: and(eq(s.orders.userId, other.id), eq(s.orders.status, "paid")) }))!;
    await signIn("customer@demo.awaji", "customer");

    const res = await account.cancelOrder(victim.id);

    expect(res.ok).toBe(false);
    expect((await db.query.orders.findFirst({ where: eq(s.orders.id, victim.id) }))!.status).toBe("paid");
  });

  it("a farmer cannot run admin operations", async () => {
    await signIn("farmer@demo.awaji", "farmer");
    const pending = await db.query.payouts.findFirst({ where: eq(s.payouts.status, "pending") });

    const jobRes = await adminOps.runJobNow({ job: "close-payouts" });
    expect(jobRes.ok).toBe(false);
    if (pending) {
      const payoutRes = await adminOps.markPayoutPaid({ payoutId: pending.id });
      expect(payoutRes.ok).toBe(false);
      expect((await db.query.payouts.findFirst({ where: eq(s.payouts.id, pending.id) }))!.status).toBe("pending");
    }
  });

  it("a customer cannot touch another customer's saved address", async () => {
    const other = (await db.query.user.findFirst({ where: eq(s.user.email, "sato@example.jp") }))!;
    const victim = (await db.query.addresses.findFirst({ where: eq(s.addresses.userId, other.id) }))!;
    await signIn("customer@demo.awaji", "customer");

    const setDefault = await account.setDefaultAddress(victim.id);
    const removed = await account.deleteAddress(victim.id);

    expect(setDefault.ok).toBe(false);
    expect(removed.ok).toBe(false);
    expect(await db.query.addresses.findFirst({ where: eq(s.addresses.id, victim.id) })).toBeDefined();
  });

  it("a customer cannot attach another customer's order to a message", async () => {
    const other = (await db.query.user.findFirst({ where: eq(s.user.email, "sato@example.jp") }))!;
    const foreign = (await db
      .select({ id: s.farmOrders.id, farmId: s.farmOrders.farmId })
      .from(s.farmOrders)
      .innerJoin(s.orders, eq(s.orders.id, s.farmOrders.orderId))
      .where(eq(s.orders.userId, other.id))
      .limit(1))[0];
    await signIn("customer@demo.awaji", "customer");

    const res = await messages.sendMessage({ farmId: foreign.farmId, farmOrderId: foreign.id, body: "この注文について教えてください" });

    expect(res.ok).toBe(false);
    const attached = await db.query.messages.findFirst({ where: eq(s.messages.farmOrderId, foreign.id) });
    expect(attached).toBeUndefined();
  });

  it("a farmer cannot reply to a review on another farm's product", async () => {
    await signIn("farmer@demo.awaji", "farmer");
    const victim = (await db.query.reviews.findFirst({ where: eq(s.reviews.farmId, theirs.id) }))!;

    const res = await reviews.replyToReview({ reviewId: victim.id, reply: "こちらは別の農園です" });

    expect(res.ok).toBe(false);
    expect((await db.query.reviews.findFirst({ where: eq(s.reviews.id, victim.id) }))!.reply).toBe(victim.reply);
  });

  it("a farmer cannot change or remove another farm's staff (#24)", async () => {
    const [victim] = await db
      .insert(s.farmMembers)
      .values({ farmId: theirs.id, email: "their-staff@awaji-test.jp", access: "shipping", expiresAt: new Date(Date.now() + 86_400_000) })
      .returning();
    await signIn("farmer@demo.awaji", "farmer");

    expect((await farmStaff.changeStaffAccess({ memberId: victim.id, access: "all" })).ok).toBe(false);
    expect((await farmStaff.removeStaff({ memberId: victim.id })).ok).toBe(false);
    expect((await farmStaff.resendStaffInvite({ memberId: victim.id })).ok).toBe(false);
    expect((await db.query.farmMembers.findFirst({ where: eq(s.farmMembers.id, victim.id) }))!.access).toBe("shipping");
  });

  it("a signed-out visitor cannot mutate anything", async () => {
    currentUser = null;
    const anyProduct = (await db.query.products.findFirst())!;
    const form = new FormData();
    form.set("id", anyProduct.id);
    form.set("name", "匿名からの変更");
    form.set("category", anyProduct.category);
    form.set("summary", anyProduct.summary);
    form.set("description", anyProduct.description);
    form.set("cultivation", anyProduct.cultivation);
    form.set("status", "active");

    expect((await farmerProducts.saveProduct(null, form)).ok).toBe(false);
    expect((await adminOps.runJobNow({ job: "cancel-unpaid" })).ok).toBe(false);
    expect((await db.query.products.findFirst({ where: eq(s.products.id, anyProduct.id) }))!.name).toBe(anyProduct.name);
  });

  it("二段階認証を設定していない運営（デモ以外）は運営の操作ができない", async () => {
    const admin = (await db.query.user.findFirst({ where: eq(s.user.email, "admin@demo.awaji") }))!;
    // 本物の運営アカウント（デモのドメイン以外）として呼ぶ
    currentUser = { id: admin.id, name: "本番 運営", email: "owner@awaji-marche.jp", image: null, role: "admin", twoFactorEnabled: false };
    const before = (await db.query.platformSettings.findMany()).length;
    const res = await adminOps.setMaintenanceMode({ enabled: true });
    expect(res).toMatchObject({ ok: false, error: expect.stringContaining("二段階認証") });
    expect((await db.query.platformSettings.findMany()).length).toBe(before);

    currentUser = { ...currentUser, twoFactorEnabled: true };
    expect((await adminOps.setMaintenanceMode({ enabled: false })).ok).toBe(true);
  });
});
