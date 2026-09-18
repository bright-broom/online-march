import { PageHeaderSkeleton } from "@/components/farmer/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <PageHeaderSkeleton actions={false} />
      <Skeleton className="h-[calc(100svh-11rem)] min-h-[480px] rounded-xl" />
    </div>
  );
}
