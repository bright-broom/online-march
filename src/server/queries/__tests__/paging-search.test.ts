import { desc, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

/**
 * 画面の基本（#21）: 注文履歴のページ送り、商品レビューの「もっと見る」、運営の注文・ユーザーをサーバー側で全件から探す。
 * どれも「最新 N 件で打ち切り、それより前は見られない」だったもの。
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), redirect: vi.fn() }));

const { db } = await import("@/db/client");
const s = await import("@/db/schema");
const { countOrders, listOrders } = await import("../account");
const { getAdminOrders, getAdminUsers } = await import("../admin");
const { getMoreProductReviews, getProductReviews } = await import("../catalog");
const { loadMoreProductReviews } = await import("@/server/actions/engagement");

describe("注文履歴のページ送り", () => {
  it("ページをまたいでも重ならず、全件をたどれる", async () => {
    const u = (await db.query.user.findFirst({ where: eq(s.user.email, "customer@demo.awaji") }))!;
    const total = await countOrders(u.id);
    expect(total).toBeGreaterThan(3);
    const size = 3;
    const seen: string[] = [];
    for (let offset = 0; offset < total; offset += size) seen.push(...(await listOrders(u.id, size, offset)).map((o) => o.id));
    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
  });
});

describe("商品レビューの「もっと見る」", () => {
  it("最初の分の続きから、重ならずに最後まで読める", async () => {
    const [top] = await db.select({ productId: s.reviews.productId, n: s.reviews.id }).from(s.reviews).where(eq(s.reviews.isPublished, true)).orderBy(desc(s.reviews.createdAt)).limit(1);
    const productId = top.productId;
    const published = (await db.select().from(s.reviews).where(eq(s.reviews.productId, productId))).filter((r) => r.isPublished).length;
    const first = await getProductReviews(productId, 1);
    const ids = first.items.map((r) => r.id);
    let offset = ids.length;
    // 回数に上限を付ける: 続きが進まない不具合でテストが止まらず固まらないように
    for (let guard = 0; guard <= published; guard++) {
      const more = await getMoreProductReviews(productId, offset, 1);
      ids.push(...more.items.map((r) => r.id));
      offset += more.items.length;
      if (!more.hasMore) break;
    }
    expect(ids).toHaveLength(published);
    expect(new Set(ids).size).toBe(published);
  });

  it("offset はおかしな値を受け付けない", async () => {
    const product = (await db.query.products.findFirst())!;
    expect((await loadMoreProductReviews({ productId: product.id, offset: -1 })).ok).toBe(false);
    expect((await loadMoreProductReviews({ productId: product.id, offset: 10_000_000 })).ok).toBe(false);
    expect((await loadMoreProductReviews({ productId: product.id, offset: 0 })).ok).toBe(true);
  });
});

describe("運営の検索（サーバー側）", () => {
  it("一覧の件数上限より古い注文も、注文番号で見つかる", async () => {
    const [oldest] = await db.select().from(s.orders).orderBy(s.orders.createdAt).limit(1);

    const { rows: latestOnly } = await getAdminOrders(undefined, 1);
    expect(latestOnly.map((r) => r.id)).not.toContain(oldest.id);
    const { rows } = await getAdminOrders(undefined, 1, oldest.code);
    expect(rows.map((r) => r.id)).toEqual([oldest.id]);
  });

  it("「%」「_」はそのままの文字として探す（全件に当たらない）", async () => {
    const { rows } = await getAdminOrders(undefined, 500, "%");
    expect(rows).toHaveLength(0);
    expect((await getAdminUsers("_")).rows).toHaveLength(0);
  });

  it("ユーザーは名前・メール・農園名で見つかる", async () => {
    const farm = (await db.query.farms.findFirst({ where: eq(s.farms.slug, "awa-farm"), with: { owner: true } }))!;
    const byFarm = await getAdminUsers(farm.name.slice(0, 3));
    expect(byFarm.rows.map((r) => r.id)).toContain(farm.ownerId);
    const byEmail = await getAdminUsers(farm.owner.email.toUpperCase());
    expect(byEmail.rows.map((r) => r.id)).toEqual([farm.ownerId]);
  });
});
