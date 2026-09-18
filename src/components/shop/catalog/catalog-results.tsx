import { SearchX } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/nav";
import { listProducts } from "@/server/queries/catalog";
import { ProductGrid, ProductGridSkeleton } from "../product-card";
import type { CatalogFacets } from "./catalog-filters";
import { CatalogPagination } from "./catalog-pagination";
import { loadCatalogParams } from "./catalog-params";
import { CatalogResultsFrame } from "./catalog-pending";
import { CatalogToolbar } from "./catalog-toolbar";

/** Request-time (reads searchParams) — render inside <Suspense>. */
export async function CatalogResults({
  searchParams,
  facets,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  facets: CatalogFacets;
}) {
  const params = await loadCatalogParams(searchParams);
  const result = await listProducts({
    q: params.q || undefined,
    category: params.category,
    farm: params.farm,
    cultivation: params.cultivation,
    price: params.price,
    inStock: params.stock,
    sort: params.sort,
    page: params.page,
  });

  return (
    <div className="space-y-8">
      <CatalogToolbar total={result.total} facets={facets} />
      <CatalogResultsFrame>
        {result.items.length ? (
          <>
            <ProductGrid products={result.items} priorityCount={result.page === 1 ? 4 : 0} />
            <CatalogPagination params={params} page={result.page} pageCount={result.pageCount} />
          </>
        ) : (
          <EmptyState
            icon={SearchX}
            title="条件に合う商品が見つかりませんでした"
            description="条件を減らすか、別のキーワードでお試しください。"
            className="bg-paper/60 border py-16"
          >
            <Button asChild variant="outline" className="h-10 rounded-full px-5">
              <Link href={routes.products}>すべての商品を見る</Link>
            </Button>
          </EmptyState>
        )}
      </CatalogResultsFrame>
    </div>
  );
}

export function CatalogResultsSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-24" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24 rounded-full lg:hidden" />
          <Skeleton className="h-10 w-32 rounded-full" />
        </div>
      </div>
      <ProductGridSkeleton count={8} />
    </div>
  );
}
