import { eq, ne } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 投稿したレビューは、本人だけが直せて消せる。星を変えたら商品と生産者の平均評価も追随する
 * （レビューは買う人の判断材料なので、表示と集計がずれない方が大事）。
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));

let currentUser: { id: string; name: string; email: string; image: null; role: "customer" | "farmer" | "admin" } | null = null;
vi.mock("@/server/auth/session", () => ({ getSessionUser: async () => currentUser }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { updateReview, deleteReview } = await import("../reviews");

const signIn = async (email: string) => {
  const u = (await db.query.user.findFirst({ where: eq(s.user.email, email) }))!;
  currentUser = { id: u.id, name: u.name, email: u.email, image: null, role: "customer" };
};

const form = (fields: Record<string, string | number>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, String(v));
  return fd;
};

const productOf = async (id: string) => (await db.query.products.findFirst({ where: eq(s.products.id, id) }))!;
const average = (p: { ratingSum: number; ratingCount: number }) => (p.ratingCount ? p.ratingSum / p.ratingCount : 0);

let reviewId = "";
let productId = "";

beforeEach(async () => {
  await signIn("customer@demo.awaji");
  const product = (await db.query.products.findFirst({ where: eq(s.products.slug, "awa-tsurigoya-tarzan") }))!;
  productId = product.id;
  await db.delete(s.reviews).where(eq(s.reviews.userId, currentUser!.id));
  const [row] = await db
    .insert(s.reviews)
    .values({ productId, farmId: product.farmId, userId: currentUser!.id, rating: 5, title: "甘い", body: "サラダにしてもおいしい" })
    .returning({ id: s.reviews.id });
  reviewId = row.id;
  await (await import("@/server/services/orders")).recomputeRatings(productId, product.farmId);
});

describe("投稿済みレビュー", () => {
  it("本人が書き直せて、商品の平均評価も計算し直される", async () => {
    const before = average(await productOf(productId));

    const res = await updateReview(null, form({ reviewId, rating: 1, title: "訂正します", body: "すこし柔らかいものが混ざっていました" }));

    expect(res.ok).toBe(true);
    const after = (await db.query.reviews.findFirst({ where: eq(s.reviews.id, reviewId) }))!;
    expect(after.rating).toBe(1);
    expect(after.title).toBe("訂正します");
    expect(average(await productOf(productId))).toBeLessThan(before);
  });

  it("本人が削除でき、評価から外れる", async () => {
    const withReview = await productOf(productId);

    const res = await deleteReview(reviewId);

    expect(res.ok).toBe(true);
    expect(await db.query.reviews.findFirst({ where: eq(s.reviews.id, reviewId) })).toBeUndefined();
    const after = await productOf(productId);
    expect(after.ratingCount).toBe(withReview.ratingCount - 1);
  });

  it("他人のレビューは書き換えも削除もできない", async () => {
    const other = (await db.query.user.findFirst({ where: ne(s.user.id, currentUser!.id) }))!;
    await signIn(other.email);

    const edit = await updateReview(null, form({ reviewId, rating: 1, title: "乗っ取り", body: "他人のレビューを書き換える" }));
    const remove = await deleteReview(reviewId);

    expect(edit.ok).toBe(false);
    expect(remove.ok).toBe(false);
    const untouched = (await db.query.reviews.findFirst({ where: eq(s.reviews.id, reviewId) }))!;
    expect(untouched.rating).toBe(5);
    expect(untouched.title).toBe("甘い");
  });

  it("空の本文や範囲外の星は受け付けない", async () => {
    const short = await updateReview(null, form({ reviewId, rating: 5, title: "", body: "短い" }));
    const outOfRange = await updateReview(null, form({ reviewId, rating: 9, title: "", body: "星が範囲外のレビューです" }));

    expect(short.ok).toBe(false);
    expect(outOfRange.ok).toBe(false);
    expect((await db.query.reviews.findFirst({ where: eq(s.reviews.id, reviewId) }))!.rating).toBe(5);
  });
});
