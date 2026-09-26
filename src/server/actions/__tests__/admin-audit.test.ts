import { desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 運営の操作記録（#19）。返金・手数料率・メンテナンス・振込済み・ロール変更などを、誰がいつ行ったか残す。
 * 失敗した操作や、運営以外の人の操作は記録しない（記録が「行われたこと」の一覧になるように）。
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));
vi.mock("@/server/services/email", () => ({ sendEmail: vi.fn(async () => {}) }));

type Role = "customer" | "farmer" | "admin";
let currentUser: { id: string; name: string; email: string; image: null; role: Role; twoFactorEnabled?: boolean } | null = null;
vi.mock("@/server/auth/session", () => ({ getSessionUser: async () => currentUser }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const adminOps = await import("../admin-ops");
const adminFarms = await import("../admin-farms");
const adminUsers = await import("../admin-users");
const adminOrders = await import("../admin-orders");
const { createOrder, markOrderPaid } = await import("@/server/services/orders");
const { toYmd } = await import("@/lib/dates");

const signIn = async (email: string, role: Role) => {
  const u = (await db.query.user.findFirst({ where: eq(s.user.email, email) }))!;
  currentUser = { id: u.id, name: u.name, email: u.email, image: null, role, twoFactorEnabled: true };
  return u;
};
const latest = async () => (await db.select().from(s.adminAuditLogs).orderBy(desc(s.adminAuditLogs.createdAt)).limit(1))[0];
const countLogs = async () => (await db.select().from(s.adminAuditLogs)).length;
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
const address = { recipientName: "記録 テスト", postalCode: "5300001", prefecture: "大阪府", city: "大阪市", line1: "1", phone: "0600000000" };

let admin: typeof s.user.$inferSelect;
beforeEach(async () => {
  admin = await signIn("admin@demo.awaji", "admin");
});

describe("運営の操作記録", () => {
  it("標準手数料率の変更は、誰が・変更前後の率を残す", async () => {
    expect((await adminOps.updatePlatformCommission(null, form({ ratePercent: "8" }))).ok).toBe(true);

    const log = await latest();
    expect(log).toMatchObject({ action: "platform.commission", actorId: admin.id, actorEmail: admin.email, detail: { toBps: 800 } });
    expect(log.summary).toContain("→ 8%");
    await adminOps.updatePlatformCommission(null, form({ ratePercent: "10" }));
  });

  it("メンテナンスモード・生産者の手数料率・生産者の停止を残す", async () => {
    await adminOps.setMaintenanceMode({ enabled: true });
    expect(await latest()).toMatchObject({ action: "platform.maintenance", detail: { enabled: true } });
    await adminOps.setMaintenanceMode({ enabled: false });

    const farm = (await db.query.farms.findFirst({ where: eq(s.farms.slug, "awa-farm") }))!;
    await adminFarms.setFarmCommission(null, form({ farmId: farm.id, ratePercent: "7" }));
    expect(await latest()).toMatchObject({ action: "farm.commission", targetType: "farm", targetId: farm.id, detail: { toBps: 700 } });

    await adminFarms.setFarmStatus({ farmId: farm.id, status: "suspended", reason: "確認のため" });
    const log = await latest();
    expect(log).toMatchObject({ action: "farm.status", detail: { from: "active", to: "suspended", reason: "確認のため" } });
    expect(log.summary).toContain("停止");
    await adminFarms.setFarmStatus({ farmId: farm.id, status: "active" });
  });

  it("ロールの変更を、変更前後とともに残す", async () => {
    const target = (await db.query.user.findFirst({ where: eq(s.user.email, "sato@example.jp") }))!;
    await adminUsers.setUserRole({ userId: target.id, role: "farmer" });

    expect(await latest()).toMatchObject({ action: "user.role", targetId: target.id, detail: { from: "customer", to: "farmer" } });
    await adminUsers.setUserRole({ userId: target.id, role: "customer" });
  });

  it("返金は注文と金額を残す", async () => {
    const u = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!;
    const product = (await db.query.products.findFirst({ where: eq(s.products.slug, "awa-tsurigoya-tarzan"), with: { variants: true } }))!;
    const now = new Date();
    const { order } = await createOrder({ userId: u.id, email: u.email, lines: [{ variantId: product.variants[0].id, quantity: 1 }], address, paymentProvider: "demo", now });
    await markOrderPaid(order.id, { now });

    const res = await adminOrders.refundOrder({ orderId: order.id });

    expect(res.ok, JSON.stringify(res)).toBe(true);
    const log = await latest();
    expect(log).toMatchObject({ action: "order.refund", targetType: "order", targetId: order.id });
    expect(log.detail).toMatchObject({ amount: res.ok ? res.data.amount : -1 });
    expect(log.summary).toContain(order.code);
  });

  it("振込済みにした精算を残す", async () => {
    const farm = (await db.query.farms.findFirst({ where: eq(s.farms.slug, "awa-farm") }))!;
    await db.update(s.farms).set({ stripeAccountId: null, stripeOnboarded: false }).where(eq(s.farms.id, farm.id));
    const [p] = await db
      .insert(s.payouts)
      .values({ farmId: farm.id, periodStart: "2026-08-01", periodEnd: "2026-08-31", grossSales: 5000, shippingFees: 0, commission: 0, amount: 5000, orderCount: 1, scheduledFor: toYmd(new Date()) })
      .returning();

    expect((await adminOps.markPayoutPaid({ payoutId: p.id })).ok).toBe(true);
    const log = await latest();
    expect(log).toMatchObject({ action: "payout.mark_paid", targetId: p.id, detail: { amount: 5000, kind: "marked" } });
    expect(log.summary).toContain("2026-08分");
  });

  it("失敗した操作と、運営以外の操作は記録しない", async () => {
    const before = await countLogs();
    // refused by the guard: removing your own admin role
    expect((await adminUsers.setUserRole({ userId: admin.id, role: "customer" })).ok).toBe(false);

    await signIn("farmer@demo.awaji", "farmer");
    expect((await adminOps.setMaintenanceMode({ enabled: true })).ok).toBe(false);

    expect(await countLogs()).toBe(before);
  });
});
