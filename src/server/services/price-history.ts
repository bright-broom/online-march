import "server-only";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { REMOVED_VARIANT_SORT } from "@/config/catalog";
import { db } from "@/db";
import type { Database } from "@/db/client";
import { productVariants, products, variantPricePeriods } from "@/db/schema";
import { compareAtVerdict } from "@/lib/compare-price";

/**
 * 販売の記録と「通常価格」の表示（#11）。
 * - syncPriceHistory: 商品を保存・公開状態を変えたあとに呼ぶ。公開中（商品が active・規格が削除されていない）の規格は
 *   今の価格で期間を開き、価格が変わった・公開をやめた規格は期間を閉じる。何度呼んでも同じ（冪等）
 * - refreshDisplayCompareAt: 記録から displayCompareAtPrice を決め直す（毎日の自動処理でも呼ぶ。値下げ8週間の上限は時間で切れるため）
 */
type Exec = Pick<Database, "select" | "insert" | "update" | "query">;

export async function syncPriceHistory(exec: Exec, productId: string, now: Date) {
  const product = await exec.query.products.findFirst({ where: eq(products.id, productId), columns: { status: true } });
  if (!product) return [];
  const variants = await exec.select().from(productVariants).where(eq(productVariants.productId, productId));
  if (!variants.length) return [];
  const open = await exec
    .select()
    .from(variantPricePeriods)
    .where(and(inArray(variantPricePeriods.variantId, variants.map((v) => v.id)), isNull(variantPricePeriods.endedAt)));
  for (const v of variants) {
    const listed = product.status === "active" && v.sortOrder < REMOVED_VARIANT_SORT;
    const current = open.find((p) => p.variantId === v.id);
    if (current && (!listed || current.price !== v.price)) {
      await exec.update(variantPricePeriods).set({ endedAt: now }).where(eq(variantPricePeriods.id, current.id));
    }
    if (listed && (!current || current.price !== v.price)) {
      await exec.insert(variantPricePeriods).values({ variantId: v.id, price: v.price, startedAt: now });
    }
  }
  return refreshDisplayCompareAt(exec, [productId], now);
}

/** 規格ごとの判定（生産者の画面に理由を出すのにも使う） */
export async function compareAtVerdicts(exec: Pick<Database, "select">, variantIds: string[], now: Date) {
  if (!variantIds.length) return new Map<string, ReturnType<typeof compareAtVerdict>>();
  const [variants, periods] = await Promise.all([
    exec.select({ id: productVariants.id, price: productVariants.price, compareAt: productVariants.compareAtPrice }).from(productVariants).where(inArray(productVariants.id, variantIds)),
    exec.select().from(variantPricePeriods).where(inArray(variantPricePeriods.variantId, variantIds)),
  ]);
  return new Map(variants.map((v) => [v.id, compareAtVerdict(periods.filter((p) => p.variantId === v.id), v, now)]));
}

/** productIds を省くと、通常価格が入っているか表示中のすべての規格を見直す（毎日の自動処理）。変わった商品の id を返す */
export async function refreshDisplayCompareAt(exec: Pick<Database, "select" | "update">, productIds: string[] | null, now: Date) {
  const rows = await exec
    .select({ id: productVariants.id, productId: productVariants.productId, compareAt: productVariants.compareAtPrice, shown: productVariants.displayCompareAtPrice })
    .from(productVariants)
    .where(productIds ? inArray(productVariants.productId, productIds) : isNotNull(productVariants.compareAtPrice));
  const shownRows = productIds
    ? []
    : await exec.select({ id: productVariants.id, productId: productVariants.productId, compareAt: productVariants.compareAtPrice, shown: productVariants.displayCompareAtPrice }).from(productVariants).where(and(isNull(productVariants.compareAtPrice), isNotNull(productVariants.displayCompareAtPrice)));
  const all = [...rows, ...shownRows];
  const verdicts = await compareAtVerdicts(exec, all.map((r) => r.id), now);
  const changed = new Set<string>();
  for (const r of all) {
    const next = verdicts.get(r.id)?.ok ? r.compareAt : null;
    if (next !== r.shown) {
      await exec.update(productVariants).set({ displayCompareAtPrice: next }).where(eq(productVariants.id, r.id));
      changed.add(r.productId);
    }
  }
  return [...changed];
}

/**
 * 毎日の自動処理。保存・公開状態の変更を通らずに公開中になっている商品（この機能を入れる前から公開していた商品など）の
 * 記録を始め、閉じ忘れの期間を閉じてから、表示をすべて見直す。変わった商品の id を返す
 */
export async function refreshAllDisplayCompareAt(now: Date) {
  const [active, withOpen] = await Promise.all([
    db.select({ id: products.id }).from(products).where(eq(products.status, "active")),
    db
      .selectDistinct({ id: productVariants.productId })
      .from(variantPricePeriods)
      .innerJoin(productVariants, eq(productVariants.id, variantPricePeriods.variantId))
      .where(isNull(variantPricePeriods.endedAt)),
  ]);
  const changed = new Set<string>();
  for (const id of new Set([...active, ...withOpen].map((r) => r.id))) for (const c of await syncPriceHistory(db, id, now)) changed.add(c);
  for (const c of await refreshDisplayCompareAt(db, null, now)) changed.add(c);
  return [...changed];
}
