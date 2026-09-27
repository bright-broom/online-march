import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogFilterPanel, CatalogFilterSkeleton } from "@/components/shop/catalog/catalog-filters";
import { CatalogPendingProvider } from "@/components/shop/catalog/catalog-pending";
import { CatalogResults, CatalogResultsSkeleton } from "@/components/shop/catalog/catalog-results";
import { PageIntro } from "@/components/shop/page-intro";
import { routes, shopNav } from "@/config/nav";
import { catalogSeo } from "@/lib/catalog-seo";
import { getCatalogFacets } from "@/server/queries/catalog";
import { loadCatalogParams } from "@/components/shop/catalog/catalog-params";

const navTitle = shopNav.find((n) => n.href === routes.products)?.title ?? "商品一覧";

/** カテゴリだけの一覧は検索の入口として正規のページに、ほかの絞り込みはそこへ寄せ、サイト内検索は検索に出さない（lib/catalog-seo.ts） */
export async function generateMetadata({ searchParams }: PageProps<"/products">): Promise<Metadata> {
  const seo = catalogSeo(await loadCatalogParams(searchParams));
  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical: seo.canonical },
    openGraph: { title: seo.title, description: seo.description, url: seo.canonical },
    ...(seo.index ? {} : { robots: { index: false, follow: true } }),
  };
}

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
