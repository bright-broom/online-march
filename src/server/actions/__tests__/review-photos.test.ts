import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * レビューの写真（#21）。最大3枚・このサイトの reviews フォルダにアップロードしたものだけ・編集で差し替えられる・
 * 問題があれば運営がレビューごと非公開にする（写真も商品ページから消える）。
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));
vi.mock("@/server/services/email", () => ({ sendEmail: vi.fn() }));

type Role = "customer" | "farmer" | "admin";
let currentUser: { id: string; name: string; email: string; image: null; role: Role; twoFactorEnabled?: boolean } | null = null;
vi.mock("@/server/auth/session", () => ({ getSessionUser: async () => currentUser }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { createReview, updateReview, setReviewPublished } = await import("../reviews");
const { getProductReviews } = await import("@/server/queries/catalog");
const { catalogLimits } = await import("@/config/catalog");

const local = (n: number) => `/uploads/reviews/mfk2x9${n}-abc12${n}.webp`;
const blob = "https://abc123xyz.public.blob.vercel-storage.com/reviews/mfk2x9a-q1w2e3.jpg";

const signIn = async (email: string, role: Role) => {
  const u = (await db.query.user.findFirst({ where: eq(s.user.email, email) }))!;
  currentUser = { id: u.id, name: u.name, email: u.email, image: null, role, twoFactorEnabled: true };
  return u;
};
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

let target: { productId: string; farmOrderId: string };

beforeEach(async () => {
  await db.delete(s.rateLimit);
  const me = await signIn("customer@demo.awaji", "customer");
  // お届け済みの注文にある商品を1つ選び、既存のレビューを消して書ける状態にする
  const [row] = await db
    .select({ productId: s.orderItems.productId, farmOrderId: s.farmOrders.id })
    .from(s.orderItems)
    .innerJoin(s.farmOrders, eq(s.farmOrders.id, s.orderItems.farmOrderId))
    .innerJoin(s.orders, eq(s.orders.id, s.farmOrders.orderId))
    .where(and(eq(s.orders.userId, me.id), eq(s.farmOrders.status, "delivered")))
    .limit(1);
  target = { productId: row.productId!, farmOrderId: row.farmOrderId };
  await db.delete(s.reviews).where(and(eq(s.reviews.userId, me.id), eq(s.reviews.productId, target.productId), eq(s.reviews.farmOrderId, target.farmOrderId)));
});

const post = (images: string[]) =>
  createReview(null, form({ ...target, rating: "5", title: "写真つき", body: "とても甘くて、サラダにぴったりでした。", images: JSON.stringify(images) }));

describe("写真つきで投稿", () => {
  it("アップロードした写真を付けられ、商品ページのレビューに出る", async () => {
    const res = await post([local(1), blob]);
    expect(res.ok).toBe(true);

    const { items } = await getProductReviews(target.productId, 50);
    expect(items.find((r) => r.id === (res.ok ? res.data.id : ""))?.images).toEqual([local(1), blob]);
  });

  it(`${catalogLimits.maxReviewImages}枚まで`, async () => {
    const res = await post(Array.from({ length: catalogLimits.maxReviewImages + 1 }, (_, i) => local(i)));
    expect(res.ok).toBe(false);
    expect(res.ok ? null : res.fieldErrors?.images?.[0]).toContain(`${catalogLimits.maxReviewImages}枚まで`);
  });

  it.each([
    ["よそのサイトの画像", "https://evil.example.com/reviews/a1-b2.jpg"],
    ["商品写真のフォルダ", "/uploads/products/mfk2x9-abc123.webp"],
    ["Blob の別フォルダ", "https://abc123xyz.public.blob.vercel-storage.com/products/mfk2x9a-q1w2e3.jpg"],
    ["パスをさかのぼる", "/uploads/reviews/../products/mfk2x9-abc123.webp"],
    ["Blob に見せかけたホスト", "https://abc.public.blob.vercel-storage.com.evil.jp/reviews/mfk2x9a-q1w2e3.jpg"],
    ["画像でない拡張子", "/uploads/reviews/mfk2x9-abc123.svg"],
    ["前に別のサイト", "https://evil.example.com/uploads/reviews/mfk2x9-abc123.webp"],
    ["後ろに続き", "/uploads/reviews/mfk2x9-abc123.webp/../../products/a.jpg"],
  ])("%s は付けられない", async (_label, url) => {
    const res = await post([url]);
    expect(res.ok).toBe(false);
    expect(await db.query.reviews.findFirst({ where: and(eq(s.reviews.productId, target.productId), eq(s.reviews.farmOrderId, target.farmOrderId)) })).toBeUndefined();
  });

  it("写真なしでも今までどおり投稿できる", async () => {
    const res = await createReview(null, form({ ...target, rating: "4", title: "", body: "少し小ぶりでしたが美味しかったです。" }));
    expect(res.ok).toBe(true);
  });
});

describe("編集と運営の非公開", () => {
  it("編集で写真を差し替え・外せる", async () => {
    const res = await post([local(1)]);
    const reviewId = res.ok ? res.data.id : "";
    const edit = (images: string[]) => updateReview(null, form({ reviewId, rating: "5", title: "写真つき", body: "とても甘くて、サラダにぴったりでした。", images: JSON.stringify(images) }));
    const stored = async () => (await db.query.reviews.findFirst({ where: eq(s.reviews.id, reviewId) }))!.images;

    expect((await edit([local(2), local(3)])).ok).toBe(true);
    expect(await stored()).toEqual([local(2), local(3)]);
    expect((await edit([])).ok).toBe(true);
    expect(await stored()).toEqual([]);
    expect((await edit(["https://evil.example.com/x.jpg"])).ok).toBe(false);
    expect(await stored()).toEqual([]);
  });

  it("運営がレビューを非公開にすると、写真も商品ページから消える", async () => {
    const res = await post([local(1)]);
    const reviewId = res.ok ? res.data.id : "";
    await signIn("admin@demo.awaji", "admin");

    expect((await setReviewPublished({ reviewId, published: false })).ok).toBe(true);

    const { items } = await getProductReviews(target.productId, 500);
    expect(items.map((r) => r.id)).not.toContain(reviewId);
    expect(items.flatMap((r) => r.images)).not.toContain(local(1));
  });
});
