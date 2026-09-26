"use server";
import { and, asc, eq, inArray, lt, max, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db } from "@/db";
import { orderItems, productImages, productVariants, products } from "@/db/schema";
import { tags } from "@/lib/cache-tags";
import { randomCode } from "@/lib/ids";
import { productFormSchema, productStatusChangeSchema } from "@/lib/validators/farmer";
import { assertFarm } from "@/server/auth/guards";
import { REMOVED_VARIANT_SORT } from "@/server/queries/farmer";
import { claimFirstPublish, notifyFollowersOfNewProduct } from "@/server/services/product-launch";
import { ActionError, formToObject, parseInput, runAction, type ActionResult } from "./_utils";

function bustProductCaches(farmId: string, productId: string) {
  updateTag(tags.products);
  updateTag(tags.product(productId));
  updateTag(tags.farmProducts(farmId));
}

/**
 * Create / update a product (form action for useActionState).
 * Tx: product row + replace images + upsert variants. Variants removed in the form are deleted,
 * unless an order_item references them — those are soft-removed (stock 0, hidden) to keep history intact.
 */
export async function saveProduct(_prev: unknown, formData: FormData): Promise<ActionResult<{ id: string; created: boolean }>> {
  return runAction(async () => {
    const { farm } = await assertFarm("catalog");
    const input = parseInput(productFormSchema, formToObject(formData));
    const now = new Date();
    const fields = {
      name: input.name,
      category: input.category,
      variety: input.variety,
      summary: input.summary,
      description: input.description,
      highlights: input.highlights,
      cultivation: input.cultivation,
      taxRate: input.taxRate,
      storageTips: input.storageTips,
      harvestFrom: input.harvestFrom,
      harvestTo: input.harvestTo,
      status: input.status,
    };

    const result = await db.transaction(async (tx) => {
      let productId: string;
      let created = false;
      if (input.id) {
        const existing = await tx.query.products.findFirst({ where: and(eq(products.id, input.id), eq(products.farmId, farm.id)) });
        if (!existing) throw new ActionError("商品が見つかりません");
        await tx
          .update(products)
          .set(fields) // publishedAt は下の claimFirstPublish だけが決める
          .where(and(eq(products.id, existing.id), eq(products.farmId, farm.id)));
        productId = existing.id;
      } else {
        const [{ top }] = await tx.select({ top: max(products.sortOrder) }).from(products).where(eq(products.farmId, farm.id));
        const [row] = await tx
          .insert(products)
          .values({
            ...fields,
            farmId: farm.id,
            slug: `${farm.slug}-${randomCode(6).toLowerCase()}`,
            sortOrder: (top ?? 0) + 1,
          })
          .returning({ id: products.id });
        productId = row.id;
        created = true;
      }

      // images: replace (first = cover)
      await tx.delete(productImages).where(eq(productImages.productId, productId));
      await tx.insert(productImages).values(
        input.images.map((img, i) => ({ productId, url: img.url, alt: img.alt || input.name, sortOrder: i })),
      );

      // variants: upsert
      const current = await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(and(eq(productVariants.productId, productId), lt(productVariants.sortOrder, REMOVED_VARIANT_SORT)));
      const currentIds = new Set(current.map((c) => c.id));
      const keep = new Set<string>();
      for (const [i, v] of input.variants.entries()) {
        const values = {
          label: v.label,
          weightGrams: v.weightGrams,
          price: v.price,
          compareAtPrice: v.compareAtPrice,
          stock: v.stock,
          sku: v.sku || null,
          isDefault: i === 0,
          sortOrder: i,
        };
        if (v.id && currentIds.has(v.id)) {
          // 在庫は「開いた時点からの増減」だけを反映する。フォームの値で上書きすると、編集中に売れた分が在庫に戻って
          // 売り越す（#2）。開いた時点の値を持たない古いフォームだけ従来どおり上書き
          const stock = v.stockBase == null ? v.stock : sql`greatest(${productVariants.stock} + ${v.stock - v.stockBase}, 0)`;
          await tx
            .update(productVariants)
            .set({ ...values, stock })
            .where(and(eq(productVariants.id, v.id), eq(productVariants.productId, productId)));
          keep.add(v.id);
        } else {
          await tx.insert(productVariants).values({ ...values, productId });
        }
      }
      const removed = [...currentIds].filter((id) => !keep.has(id));
      if (removed.length) {
        const referenced = await tx
          .selectDistinct({ id: orderItems.variantId })
          .from(orderItems)
          .where(inArray(orderItems.variantId, removed));
        const refIds = new Set(referenced.map((r) => r.id).filter((id): id is string => Boolean(id)));
        const deletable = removed.filter((id) => !refIds.has(id));
        if (deletable.length) await tx.delete(productVariants).where(inArray(productVariants.id, deletable));
        for (const [i, id] of [...refIds].entries()) {
          await tx
            .update(productVariants)
            .set({ stock: 0, isDefault: false, sortOrder: REMOVED_VARIANT_SORT + i })
            .where(eq(productVariants.id, id));
        }
      }
      const firstPublished = await claimFirstPublish(tx, productId, now);
      return { id: productId, created, firstPublished };
    });

    bustProductCaches(farm.id, result.id);
    if (result.firstPublished) await notifyFollowersOfNewProduct(result.id);
    return { id: result.id, created: result.created };
  }, "商品を保存しました");
}

/** Quick action: 公開 / 非公開 / アーカイブ. */
export async function setProductStatus(input: { id: string; status: "draft" | "active" | "archived" }): Promise<ActionResult> {
  return runAction(async () => {
    const { farm } = await assertFarm("catalog");
    const data = parseInput(productStatusChangeSchema, input);
    const product = await db.query.products.findFirst({
      where: and(eq(products.id, data.id), eq(products.farmId, farm.id)),
      with: { images: { limit: 1 }, variants: { where: lt(productVariants.sortOrder, REMOVED_VARIANT_SORT) } },
    });
    if (!product) throw new ActionError("商品が見つかりません");
    if (data.status === "active") {
      if (!product.images.length) throw new ActionError("公開するには写真を1枚以上登録してください");
      if (!product.variants.length) throw new ActionError("公開するには規格を1つ以上登録してください");
    }
    await db.update(products).set({ status: data.status }).where(and(eq(products.id, product.id), eq(products.farmId, farm.id)));
    const firstPublished = await claimFirstPublish(db, product.id, new Date());
    bustProductCaches(farm.id, product.id);
    if (firstPublished) await notifyFollowersOfNewProduct(product.id);
  }, input.status === "active" ? "商品を公開しました" : input.status === "archived" ? "商品をアーカイブしました" : "商品を非公開にしました");
}

/** Quick action: duplicate as a draft (images + visible variants). */
export async function duplicateProduct(id: string): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { farm } = await assertFarm("catalog");
    const src = await db.query.products.findFirst({
      where: and(eq(products.id, id), eq(products.farmId, farm.id)),
      with: {
        images: { orderBy: asc(productImages.sortOrder) },
        variants: { where: lt(productVariants.sortOrder, REMOVED_VARIANT_SORT), orderBy: asc(productVariants.sortOrder) },
      },
    });
    if (!src) throw new ActionError("商品が見つかりません");
    const newId = await db.transaction(async (tx) => {
      const [{ top }] = await tx.select({ top: max(products.sortOrder) }).from(products).where(eq(products.farmId, farm.id));
      const [row] = await tx
        .insert(products)
        .values({
          farmId: farm.id,
          slug: `${farm.slug}-${randomCode(6).toLowerCase()}`,
          name: `${src.name}（コピー）`.slice(0, 80),
          category: src.category,
          variety: src.variety,
          summary: src.summary,
          description: src.description,
          highlights: src.highlights,
          cultivation: src.cultivation,
          taxRate: src.taxRate,
          storageTips: src.storageTips,
          harvestFrom: src.harvestFrom,
          harvestTo: src.harvestTo,
          status: "draft",
          sortOrder: (top ?? 0) + 1,
        })
        .returning({ id: products.id });
      if (src.images.length) {
        await tx.insert(productImages).values(src.images.map((img) => ({ productId: row.id, url: img.url, alt: img.alt, sortOrder: img.sortOrder })));
      }
      if (src.variants.length) {
        await tx.insert(productVariants).values(
          src.variants.map((v) => ({
            productId: row.id, label: v.label, weightGrams: v.weightGrams, price: v.price, compareAtPrice: v.compareAtPrice,
            stock: v.stock, sku: null, isDefault: v.isDefault, sortOrder: v.sortOrder,
          })),
        );
      }
      return row.id;
    });
    updateTag(tags.farmProducts(farm.id));
    return { id: newId };
  }, "商品を複製しました（下書き）");
}
