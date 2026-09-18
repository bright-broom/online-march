import { CatalogFilterSkeleton } from "@/components/shop/catalog/catalog-filters";
import { CatalogResultsSkeleton } from "@/components/shop/catalog/catalog-results";
import { PageIntroSkeleton } from "@/components/shop/skeletons";

export default function Loading() {
  return (
    <>
      <PageIntroSkeleton />
      <div className="container-page grid gap-10 pb-20 lg:grid-cols-[15rem_1fr] lg:gap-12">
        <div className="hidden lg:block">
          <CatalogFilterSkeleton />
        </div>
        <CatalogResultsSkeleton />
      </div>
    </>
  );
}
