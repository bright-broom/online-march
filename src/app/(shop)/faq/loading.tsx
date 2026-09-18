import { PageIntroSkeleton } from "@/components/shop/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <PageIntroSkeleton />
      <div className="container-page grid gap-12 pb-20 lg:grid-cols-[1fr_20rem] lg:gap-16">
        <div className="divide-y border-t">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="py-5">
              <Skeleton className="h-5 w-3/4" />
            </div>
          ))}
        </div>
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    </>
  );
}
