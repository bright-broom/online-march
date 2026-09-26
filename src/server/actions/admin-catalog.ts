"use server";
import { eq, sum } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { productVariants, products } from "@/db/schema";
import { tags } from "@/lib/cache-tags";
import { assertRole } from "@/server/auth/guards";
import { expireTags } from "@/server/cache";
import { recordAudit } from "@/server/services/audit";
import { ActionError, parseInput, runAction, type ActionResult } from "./_utils";

function expireProduct(p: { id: string; farmId: string }) {
  expireTags(tags.products, tags.product(p.id), tags.farmProducts(p.farmId), tags.farm(p.farmId));
}

const featureInput = z.object({ productId: z.uuid(), featured: z.boolean() });

/** Toggle 特集 (isFeatured) — shown on the storefront home. */
export async function setProductFeatured(input: z.input<typeof featureInput>): Promise<ActionResult> {
  return runAction(async () => {
    const me = await assertRole("admin");
    const data = parseInput(featureInput, input);
    const [row] = await db
      .update(products)
      .set({ isFeatured: data.featured })
      .where(eq(products.id, data.productId))
      .returning({ id: products.id, farmId: products.farmId, name: products.name });
    if (!row) throw new ActionError("商品が見つかりません");
    await recordAudit(me, {
      action: "product.featured", target: { type: "product", id: row.id },
      summary: `${row.name} を特集${data.featured ? "に追加" : "から外す"}`, detail: { featured: data.featured },
    });
    expireProduct(row);
    refresh();
  }, input.featured ? "特集に追加しました" : "特集から外しました");
}

const archiveInput = z.object({ productId: z.uuid(), archived: z.boolean() });

/** Moderation: archive (hide from catalog) / restore (active or soldout by stock). */
export async function setProductArchived(input: z.input<typeof archiveInput>): Promise<ActionResult> {
  return runAction(async () => {
    const me = await assertRole("admin");
    const data = parseInput(archiveInput, input);
    const product = await db.query.products.findFirst({ where: eq(products.id, data.productId) });
    if (!product) throw new ActionError("商品が見つかりません");
    let status: typeof product.status = "archived";
    if (!data.archived) {
      if (product.status !== "archived") throw new ActionError("この商品はアーカイブされていません");
      const [s] = await db.select({ stock: sum(productVariants.stock) }).from(productVariants).where(eq(productVariants.productId, product.id));
      status = Number(s?.stock ?? 0) > 0 ? "active" : "soldout";
    }
    await db
      .update(products)
      .set({ status, isFeatured: data.archived ? false : product.isFeatured, publishedAt: product.publishedAt ?? (data.archived ? null : new Date()) })
      .where(eq(products.id, product.id));
    await recordAudit(me, {
      action: "product.archived", target: { type: "product", id: product.id },
      summary: `${product.name} を${data.archived ? "アーカイブ（ストアから非表示）" : "復元"}`, detail: { from: product.status, to: status },
    });
    expireProduct(product);
    refresh();
  }, input.archived ? "商品をアーカイブしました（ストアから非表示）" : "商品を復元しました");
}
