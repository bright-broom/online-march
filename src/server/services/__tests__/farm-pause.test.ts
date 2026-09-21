import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 受付の一時停止（お休み）。出荷できない期間に注文が入ると、出荷期限を過ぎて
 * お客さまにも農家さんにも不利益になる。止めている間は注文を作らせない。
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));

let currentUser: { id: string; name: string; email: string; image: null; role: "customer" | "farmer" | "admin" } | null = null;
vi.mock("@/server/auth/session", () => ({ getSessionUser: async () => currentUser }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { createOrder, quoteCart } = await import("../orders");
const { setFarmPause } = await import("@/server/actions/farmer-shop");
const { addDays, toYmd } = await import("@/lib/dates");

const address = { recipientName: "テスト", postalCode: "5300001", prefecture: "大阪府", city: "大阪市", line1: "1", phone: "0600000000" };
const today = toYmd(new Date());

let userId = "";
let variantId = "";
let farmId = "";

const buy = () =>
  createOrder({ userId, email: "c@x.jp", lines: [{ variantId, quantity: 1 }], address, paymentProvider: "demo", now: new Date() })
    .then(() => ({ ok: true as const }))
    .catch((e: Error) => ({ ok: false as const, error: e.message }));

const signInFarmer = async (farmSlug: string) => {
  const farm = (await db.query.farms.findFirst({ where: eq(s.farms.slug, farmSlug) }))!;
  const owner = (await db.query.user.findFirst({ where: eq(s.user.id, farm.ownerId) }))!;
  currentUser = { id: owner.id, name: owner.name, email: owner.email, image: null, role: "farmer" };
  return farm;
};

beforeEach(async () => {
  userId = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!.id;
  const product = (await db.query.products.findFirst({ where: eq(s.products.slug, "awa-tsurigoya-tarzan"), with: { variants: true } }))!;
  variantId = product.variants[0].id;
  farmId = product.farmId;
  await db.update(s.productVariants).set({ stock: 50 }).where(eq(s.productVariants.id, variantId));
  await db.update(s.farms).set({ pausedUntil: null }).where(eq(s.farms.id, farmId));
});

describe("受付の一時停止", () => {
  it("止めている間は注文できない", async () => {
    await db.update(s.farms).set({ pausedUntil: addDays(today, 3) }).where(eq(s.farms.id, farmId));

    const res = await buy();

    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/販売を終了|お取り扱い|カート/); // 購入できない旨のエラー
    const quote = await quoteCart({ lines: [{ variantId, quantity: 1 }], prefecture: "大阪府", now: new Date() });
    expect(quote.unavailable).toContain(variantId);
  });

  it("最終日も止まっていて、翌日には自動で戻る", async () => {
    await db.update(s.farms).set({ pausedUntil: today }).where(eq(s.farms.id, farmId));
    expect((await buy()).ok).toBe(false);

    await db.update(s.farms).set({ pausedUntil: addDays(today, -1) }).where(eq(s.farms.id, farmId)); // 昨日まで

    expect((await buy()).ok).toBe(true); // 解除し忘れても売り逃さない
  });

  it("止めていない農園はふつうに買える", async () => {
    expect((await buy()).ok).toBe(true);
  });

  it("生産者は自分の農園だけを止められる", async () => {
    const mine = await signInFarmer("awa-farm");
    const until = addDays(today, 6);

    const res = await setFarmPause({ until });

    expect(res.ok).toBe(true);
    expect((await db.query.farms.findFirst({ where: eq(s.farms.id, mine.id) }))!.pausedUntil).toBe(until);
    const others = await db.select().from(s.farms).where(eq(s.farms.status, "active"));
    expect(others.filter((f) => f.id !== mine.id).every((f) => f.pausedUntil === null)).toBe(true);
  });

  it("過去の日付では止められない（止まったまま戻らなくなるため）", async () => {
    await signInFarmer("awa-farm");

    const res = await setFarmPause({ until: addDays(today, -1) });

    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toContain("今日以降");
  });

  it("解除すると受付が戻る", async () => {
    const mine = await signInFarmer("awa-farm");
    await setFarmPause({ until: addDays(today, 6) });

    const res = await setFarmPause({ until: null });

    expect(res.ok).toBe(true);
    expect((await db.query.farms.findFirst({ where: eq(s.farms.id, mine.id) }))!.pausedUntil).toBeNull();
    expect((await buy()).ok).toBe(true);
  });

  it("ログインしていない人は止められない", async () => {
    currentUser = null;

    const res = await setFarmPause({ until: addDays(today, 3) });

    expect(res.ok).toBe(false);
  });
});
