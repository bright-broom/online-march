import { ImageHeroSkeleton, ProseSkeleton } from "@/components/shop/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <ImageHeroSkeleton />
      <div className="container-page grid items-center gap-8 py-16 sm:py-24 lg:grid-cols-2 lg:gap-16">
        <Skeleton className="aspect-[4/3] w-full rounded-3xl" />
        <div className="space-y-5">
          <Skeleton className="h-10 w-16" />
          <Skeleton className="h-8 w-2/3" />
          <ProseSkeleton lines={4} />
        </div>
      </div>
    </>
  );
}
