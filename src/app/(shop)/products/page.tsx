import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogFilterPanel, CatalogFilterSkeleton } from "@/components/shop/catalog/catalog-filters";
import { CatalogPendingProvider } from "@/components/shop/catalog/catalog-pending";
import { CatalogResults, CatalogResultsSkeleton } from "@/components/shop/catalog/catalog-results";
import { PageIntro } from "@/components/shop/page-intro";
import { routes, shopNav } from "@/config/nav";
import { getCatalogFacets } from "@/server/queries/catalog";

const navTitle = shopNav.find((n) => n.href === routes.products)?.title ?? "商品一覧";

export const metadata: Metadata = {
  title: "商品一覧",
  description: "南あわじの農家さんから直送される淡路島たまねぎ・新玉ねぎ・紫玉ねぎ・加工品の一覧。品種・栽培方法・価格帯で絞り込めます。",
  alternates: { canonical: routes.products },
};

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const facets = await getCatalogFacets();
  return (
    <>
      <PageIntro
        crumbs={[{ label: navTitle }]}
        eyebrow="PRODUCTS"
        title={navTitle}
        lead="品種・栽培方法・農家さんから、あなたの食卓にぴったりの玉ねぎを。すべて産地から直送です。"
      />
      <CatalogPendingProvider>
        <div className="container-page grid gap-10 pb-20 lg:grid-cols-[15rem_1fr] lg:gap-12">
          <aside aria-label="絞り込み" className="hidden lg:block">
            <div className="sticky top-24 max-h-[calc(100svh-7rem)] overflow-y-auto overscroll-contain pr-2 pb-6">
              <Suspense fallback={<CatalogFilterSkeleton />}>
                <CatalogFilterPanel facets={facets} />
              </Suspense>
            </div>
          </aside>
          <div className="min-w-0">
            <Suspense fallback={<CatalogResultsSkeleton />}>
              <CatalogResults searchParams={searchParams} facets={facets} />
            </Suspense>
          </div>
        </div>
      </CatalogPendingProvider>
    </>
  );
}
