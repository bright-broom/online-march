import { FarmCardSkeleton } from "@/components/shop/farm-card";
import { PageIntroSkeleton } from "@/components/shop/skeletons";

export default function Loading() {
  return (
    <>
      <PageIntroSkeleton />
      <div className="container-page grid gap-6 pb-20 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <FarmCardSkeleton key={i} />
        ))}
      </div>
    </>
  );
}
