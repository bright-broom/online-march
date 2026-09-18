import { HeaderSkeleton } from "@/components/admin/primitives";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <Skeleton className="h-[480px] rounded-xl xl:col-span-2" />
      </div>
    </div>
  );
}
