import { ImageHeroSkeleton } from "@/components/shop/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <ImageHeroSkeleton />
      <div className="container-page grid gap-4 py-16 sm:grid-cols-2 sm:py-24 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    </>
  );
}
