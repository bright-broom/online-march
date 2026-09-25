import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { routes } from "@/config/nav";
import { db } from "@/db";
import type { Database } from "@/db/client";
import { farmFollows, notifications, products } from "@/db/schema";

/**
 * 商品の「初めての公開」を1回だけ確定させる。published_at が空の行だけを更新するので、同時に公開ボタンが
 * 押されても、編集や再公開でも、true になるのは最初の1回だけ（フォロワーへのお知らせを重複させない）。
 */
export async function claimFirstPublish(exec: Pick<Database, "update">, productId: string, now: Date) {
  const [row] = await exec
    .update(products)
    .set({ publishedAt: now })
    .where(and(eq(products.id, productId), eq(products.status, "active"), isNull(products.publishedAt)))
    .returning({ id: products.id });
  return Boolean(row);
}

/**
 * フォロー中のお客さまへ「新商品」のお知らせ（#5）。フォローボタン・農家ページ・マイページで
 * 「新商品をお知らせします」と案内している約束の実体。サイト内のお知らせのみ（メールの配信設定がまだ無いため）。
 * 出店中（active）の農家だけ。失敗しても公開そのものは止めない。
 */
export async function notifyFollowersOfNewProduct(productId: string) {
  try {
    const p = await db.query.products.findFirst({
      where: eq(products.id, productId),
      columns: { name: true, slug: true, farmId: true },
      with: { farm: { columns: { name: true, status: true } } },
    });
    if (!p || p.farm.status !== "active") return 0;
    const followers = await db.select({ userId: farmFollows.userId }).from(farmFollows).where(eq(farmFollows.farmId, p.farmId));
    if (!followers.length) return 0;
    await db.insert(notifications).values(
      followers.map((f) => ({
        userId: f.userId,
        type: "product" as const,
        title: `${p.farm.name}の新商品`,
        body: p.name,
        href: routes.product(p.slug),
      })),
    );
    return followers.length;
  } catch (err) {
    console.error("[product-launch]", err);
    return 0;
  }
}

