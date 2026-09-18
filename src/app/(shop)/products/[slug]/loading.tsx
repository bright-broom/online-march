import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="container-page pt-6 pb-20 sm:pt-8">
      <Skeleton className="h-3 w-56" />
      <div className="mt-6 grid gap-10 lg:mt-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16">
        <div className="space-y-3">
          <Skeleton className="aspect-[4/5] w-full rounded-3xl" />
          <div className="flex gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="size-16 rounded-xl sm:size-20" />
            ))}
          </div>
        </div>
        <div className="space-y-7">
          <div className="space-y-4">
            <Skeleton className="h-5 w-40 rounded-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-[4.5rem] rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-12 w-full rounded-full" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
