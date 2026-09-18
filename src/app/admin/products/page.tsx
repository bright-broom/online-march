import type { Metadata } from "next";
import { FilterTabs } from "@/components/admin/primitives";
import { ProductsTable } from "@/components/admin/products/products-table";
import { ReviewsTable } from "@/components/admin/products/reviews-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { routes } from "@/config/nav";
import { requireRole } from "@/server/auth/guards";
import { getAdminProducts, getAdminReviews } from "@/server/queries/admin";

export const metadata: Metadata = { title: "商品" };

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  await requireRole("admin", routes.admin.products);
  const tab = (await searchParams).tab === "reviews" ? "reviews" : "all";
  const [products, reviews] = await Promise.all([getAdminProducts(), getAdminReviews()]);
  const hiddenReviews = reviews.filter((r) => !r.isPublished).length;

  return (
    <>
      <PageHeader
        title="商品"
        description="全生産者の商品を横断してモデレーション。特集への掲載、アーカイブ、レビューの公開管理を行います。"
      />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FilterTabs
            basePath={routes.admin.products}
            param="tab"
            current={tab}
            items={[
              { value: "all", label: "商品", count: products.length },
              { value: "reviews", label: "レビュー", count: reviews.length },
            ]}
          />
          <p className="text-muted-foreground text-xs">
            販売中 <span className="num text-foreground font-semibold">{products.filter((p) => p.status === "active").length}</span>
            <span className="mx-2">·</span>
            特集 <span className="num text-foreground font-semibold">{products.filter((p) => p.isFeatured).length}</span>
            <span className="mx-2">·</span>
            在庫切れ <span className="num text-foreground font-semibold">{products.filter((p) => p.stock === 0 && p.status !== "archived").length}</span>
            <span className="mx-2">·</span>
            非公開レビュー <span className="num text-foreground font-semibold">{hiddenReviews}</span>
          </p>
        </div>
        {tab === "reviews" ? <ReviewsTable rows={reviews} /> : <ProductsTable rows={products} />}
      </div>
    </>
  );
}
