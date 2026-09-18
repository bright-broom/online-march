import { PageHeaderSkeleton, StatGridSkeleton, TableSkeleton } from "@/components/farmer/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton actions={false} />
      <StatGridSkeleton />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-[400px] rounded-xl" />
        <Skeleton className="h-60 rounded-xl" />
      </div>
      <TableSkeleton rows={6} />
    </div>
  );
}
