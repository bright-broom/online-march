import { Skeleton } from "@/components/ui/skeleton";

export function PageHeaderSkeleton() {
  return (
    <div className="mb-6 space-y-2">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72 max-w-full" />
    </div>
  );
}

export function MypageHomeSkeleton() {
  return (
    <div aria-busy>
      <PageHeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Skeleton className="h-72 rounded-xl xl:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 4, height = 112 }: { rows?: number; height?: number }) {
  return (
    <div aria-busy>
      <PageHeaderSkeleton />
      <Skeleton className="mb-4 h-9 w-80 max-w-full rounded-lg" />
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="w-full rounded-xl" style={{ height }} />)}
      </div>
    </div>
  );
}

export function GridSkeleton({ items = 8 }: { items?: number }) {
  return (
    <div aria-busy>
      <PageHeaderSkeleton />
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: items }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-square w-full rounded-2xl" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function OrderDetailSkeleton() {
  return (
    <div aria-busy>
      <PageHeaderSkeleton />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  );
}

export function MessagesSkeleton() {
  return (
    <div aria-busy>
      <PageHeaderSkeleton />
      <div className="grid h-[calc(100svh-14rem)] min-h-[28rem] gap-0 overflow-hidden rounded-xl border md:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="space-y-3 border-r p-3">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
        <div className="hidden p-4 md:block">
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div aria-busy>
      <PageHeaderSkeleton />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
