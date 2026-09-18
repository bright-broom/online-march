import { PageHeaderSkeleton } from "@/components/farmer/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton actions={false} />
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Skeleton className="h-72 rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-11 w-56 rounded-xl" />
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      </div>
    </div>
  );
}
