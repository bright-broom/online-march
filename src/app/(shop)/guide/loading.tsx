import { PageIntroSkeleton, ProseSkeleton } from "@/components/shop/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <PageIntroSkeleton />
      <div className="container-page grid gap-12 pb-20 lg:grid-cols-[14rem_1fr] lg:gap-16">
        <div className="hidden space-y-3 lg:block">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-32" />
          ))}
        </div>
        <div className="space-y-12">
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
          <ProseSkeleton lines={5} />
          <ProseSkeleton lines={4} />
        </div>
      </div>
    </>
  );
}
