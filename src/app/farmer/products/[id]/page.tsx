import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { ProductForm } from "@/components/farmer/products/product-form";
import { requireFarm } from "@/server/auth/guards";
import { getCompareAtNotes, getFarmProduct } from "@/server/queries/farmer";

export const metadata: Metadata = { title: "商品を編集" };

export default async function EditProductPage({ params }: PageProps<"/farmer/products/[id]">) {
  const { id } = await params;
  const { farm } = await requireFarm("catalog");
  const product = /^[0-9a-f-]{36}$/i.test(id) ? await getFarmProduct(farm.id, id) : null;
  if (!product) notFound();
  await connection();
  // 通常価格を入れた規格だけ、お客さまに打ち消し表示しているか・していない理由を出す（#11）
  const notes = await getCompareAtNotes(product.variants.filter((v) => v.compareAtPrice != null).map((v) => v.id), new Date());
  return (
    <div>
      <PageHeader
        title="商品を編集"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {product.name}
            <StatusBadge kind="product" status={product.status} />
          </span>
        }
      />
      {/* key: remount with fresh server data (new variant ids) after each save */}
      <ProductForm
        key={product.updatedAt.toISOString()}
        farm={{ name: farm.name, avatarImage: farm.avatarImage }}
        product={{
          id: product.id,
          slug: product.slug,
          name: product.name,
          category: product.category,
          variety: product.variety,
          summary: product.summary,
          description: product.description,
          highlights: product.highlights,
          cultivation: product.cultivation,
          taxRate: product.taxRate,
          storageTips: product.storageTips,
          harvestFrom: product.harvestFrom,
          harvestTo: product.harvestTo,
          status: product.status,
          images: product.images.map((i) => ({ url: i.url, alt: i.alt })),
          variants: product.variants.map((v) => ({
            id: v.id, label: v.label, weightGrams: v.weightGrams, price: v.price, compareAtPrice: v.compareAtPrice, stock: v.stock, sku: v.sku ?? "",
            compareAtNote: notes[v.id] ?? null,
          })),
        }}
      />
    </div>
  );
}
