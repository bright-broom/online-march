import { PageIntroSkeleton, ProseSkeleton } from "@/components/shop/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <PageIntroSkeleton />
      <div className="container-page grid gap-10 pb-20 lg:grid-cols-[14rem_1fr] lg:gap-16">
        <div className="order-last space-y-2 lg:order-first">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-lg" />
          ))}
        </div>
        <ProseSkeleton lines={10} />
      </div>
    </>
  );
}
