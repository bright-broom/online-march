import { ProductGridSkeleton } from "@/components/shop/product-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <Skeleton className="h-[42svh] min-h-72 w-full rounded-none sm:h-[52svh]" />
      <div className="container-page pb-20">
        <div className="relative -mt-16 flex flex-col gap-4 sm:-mt-20 sm:flex-row sm:items-end sm:gap-6">
          <Skeleton className="ring-background size-28 rounded-full ring-8 sm:size-36" />
          <div className="space-y-3 pb-1">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
        </div>
        <Skeleton className="mt-10 h-20 w-full rounded-2xl" />
        <div className="grid gap-10 py-16 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="space-y-3">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <Skeleton className="aspect-[16/10] w-full rounded-2xl" />
        </div>
        <ProductGridSkeleton count={4} />
      </div>
    </>
  );
}
