import { ProductGridSkeleton } from "@/components/shop/product-card";
import { Skeleton } from "@/components/ui/skeleton";

/** Home skeleton (hero + values + product grid). Nested routes provide their own loading.tsx. */
export default function Loading() {
  return (
    <>
      <div className="bg-muted flex min-h-[88svh] items-end lg:min-h-[92svh]">
        <div className="container-page w-full space-y-5 pb-14">
          <Skeleton className="bg-background/40 h-3 w-48" />
          <Skeleton className="bg-background/40 h-12 w-3/4 max-w-2xl sm:h-16" />
          <Skeleton className="bg-background/40 h-12 w-2/3 max-w-xl sm:h-16" />
          <Skeleton className="bg-background/40 h-4 w-full max-w-lg" />
          <div className="flex gap-3 pt-3">
            <Skeleton className="bg-background/40 h-12 w-40 rounded-full" />
            <Skeleton className="bg-background/40 h-12 w-44 rounded-full" />
          </div>
        </div>
      </div>
      <div className="container-page py-16 sm:py-24">
        <ProductGridSkeleton count={4} />
      </div>
    </>
  );
}
