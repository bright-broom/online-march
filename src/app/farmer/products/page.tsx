import { Boxes, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { LinkTabs } from "@/components/farmer/link-tabs";
import { ProductTable } from "@/components/farmer/products/product-table";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/nav";
import { productStatusMeta } from "@/config/status";
import type { ProductStatus } from "@/db/schema";
import { requireFarm } from "@/server/auth/guards";
import { listFarmProducts, productStatusFilters } from "@/server/queries/farmer";

export const metadata: Metadata = { title: "商品管理" };

export default async function FarmerProductsPage({ searchParams }: PageProps<"/farmer/products">) {
  const { farm } = await requireFarm("catalog");
  const sp = await searchParams;
  const status = (productStatusFilters as string[]).includes(String(sp.status)) ? (String(sp.status) as ProductStatus | "all") : "all";
  const all = await listFarmProducts(farm.id);
  const rows = status === "all" ? all.filter((p) => p.status !== "archived") : all.filter((p) => p.status === status);
  const countOf = (s: ProductStatus | "all") => (s === "all" ? all.filter((p) => p.status !== "archived").length : all.filter((p) => p.status === s).length);
  const lowStock = all.filter((p) => p.status === "active" && p.lowStock).length;

  return (
    <div>
      <PageHeader
        title="商品管理"
        description={lowStock ? `在庫がわずかな商品が${lowStock}件あります。規格の在庫を補充しましょう。` : "商品の登録・編集、公開状態や在庫を管理します。"}
        actions={
          <Button asChild>
            <Link href={routes.farmer.newProduct}><Plus />商品を登録</Link>
          </Button>
        }
      />
      <LinkTabs
        className="mb-4"
        active={status}
        tabs={productStatusFilters.map((s) => ({
          key: s,
          label: s === "all" ? "すべて" : productStatusMeta[s].label,
          count: countOf(s),
          href: s === "all" ? routes.farmer.products : `${routes.farmer.products}?status=${s}`,
        }))}
      />
      {all.length ? (
        <ProductTable rows={rows} />
      ) : (
        <EmptyState icon={Boxes} title="まだ商品がありません" description="写真と規格（5kg・10kgなど）を登録すると、すぐに販売を始められます。">
          <Button asChild>
            <Link href={routes.farmer.newProduct}><Plus />最初の商品を登録</Link>
          </Button>
        </EmptyState>
      )}
    </div>
  );
}
