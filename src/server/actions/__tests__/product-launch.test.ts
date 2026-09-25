import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));

let currentUser: { id: string; name: string; email: string; image: null; role: "farmer"; twoFactorEnabled: boolean } | null = null;
vi.mock("@/server/auth/session", () => ({ getSessionUser: async () => currentUser }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { duplicateProduct, saveProduct, setProductStatus } = await import("../farmer-products");

let farmId = "";
let followerId = "";
let otherCustomerId = "";

/** 下書きの新商品（まだ一度も公開していない） */
async function draftProduct() {
  const source = (await db.query.products.findFirst({ where: and(eq(s.products.farmId, farmId), eq(s.products.status, "active")) }))!;
  const res = await duplicateProduct(source.id);
  if (!res.ok) throw new Error(res.error);
  const p = (await db.query.products.findFirst({ where: eq(s.products.id, res.data.id) }))!;
  expect(p).toMatchObject({ status: "draft", publishedAt: null });
  return p;
}
const launchNotices = async (userId: string, slug: string) =>
  (await db.select().from(s.notifications).where(and(eq(s.notifications.userId, userId), eq(s.notifications.type, "product")))).filter((n) => n.href === `/products/${slug}`);

beforeAll(async () => {
  const farmer = (await db.query.user.findFirst({ where: eq(s.user.email, "farmer@demo.awaji") }))!;
  currentUser = { id: farmer.id, name: farmer.name, email: farmer.email, image: null, role: "farmer", twoFactorEnabled: false };
  farmId = (await db.query.farms.findFirst({ where: eq(s.farms.ownerId, farmer.id) }))!.id;
  followerId = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!.id;
  otherCustomerId = (await db.insert(s.user).values({ id: "launch-other", name: "別の客", email: "other-launch@awaji-test.jp", role: "customer" }).returning())[0].id;
  await db.insert(s.farmFollows).values({ userId: followerId, farmId }).onConflictDoNothing();
});

describe("フォロー中の農家の新商品のお知らせ", () => {
  it("初めて公開したとき、フォロワーにだけ届く", async () => {
    const p = await draftProduct();
    expect((await setProductStatus({ id: p.id, status: "active" })).ok).toBe(true);
    const notices = await launchNotices(followerId, p.slug);
    expect(notices).toHaveLength(1);
    expect(notices[0].body).toBe(p.name);
    expect(await launchNotices(otherCustomerId, p.slug)).toHaveLength(0);
  });

  it("非公開に戻して再公開しても、2回目は届かない", async () => {
    const p = await draftProduct();
    await setProductStatus({ id: p.id, status: "active" });
    await setProductStatus({ id: p.id, status: "draft" });
    await setProductStatus({ id: p.id, status: "active" });
    expect(await launchNotices(followerId, p.slug)).toHaveLength(1);
  });

  it("公開ボタンが同時に押されても1回だけ", async () => {
    const p = await draftProduct();
    await Promise.all([setProductStatus({ id: p.id, status: "active" }), setProductStatus({ id: p.id, status: "active" })]);
    expect(await launchNotices(followerId, p.slug)).toHaveLength(1);
  });

  it("下書きのまま保存しても届かない", async () => {
    const p = await draftProduct();
    await setProductStatus({ id: p.id, status: "draft" });
    expect(await launchNotices(followerId, p.slug)).toHaveLength(0);
  });

  it("編集フォームで「公開」にして保存したときも、初回だけ届く", async () => {
    const draft = await draftProduct();
    const p = (await db.query.products.findFirst({ where: eq(s.products.id, draft.id), with: { variants: true, images: true } }))!;
    const form = new FormData();
    for (const k of ["name", "category", "summary", "description", "cultivation"] as const) form.set(k, String(p[k]));
    form.set("id", p.id);
    form.set("variety", p.variety ?? "");
    form.set("highlights", JSON.stringify(p.highlights ?? []));
    form.set("images", JSON.stringify(p.images.map((i) => ({ url: i.url, alt: i.alt }))));
    form.set("variants", JSON.stringify(p.variants.map((v) => ({ id: v.id, label: v.label, weightGrams: v.weightGrams, price: v.price, compareAtPrice: v.compareAtPrice, stock: v.stock, stockBase: v.stock, sku: v.sku ?? "" }))));
    form.set("status", "active");
    expect((await saveProduct(null, form)).ok).toBe(true);
    expect(await launchNotices(followerId, p.slug)).toHaveLength(1);
    // 公開中のまま編集して保存しても、もう届かない
    expect((await saveProduct(null, form)).ok).toBe(true);
    expect(await launchNotices(followerId, p.slug)).toHaveLength(1);
  });
});

