import { Skeleton } from "@/components/ui/skeleton";

/** loading.tsx skeletons mirroring each page's layout (prevents CLS). */
export function PageHeaderSkeleton({ actions = true }: { actions?: boolean }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      {actions && <Skeleton className="h-9 w-32" />}
    </div>
  );
}

export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} className="h-[136px] rounded-xl" />)}
    </div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-9 w-full max-w-xs" />
      <div className="bg-card space-y-px overflow-hidden rounded-xl border">
        {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-14 rounded-none" />)}
      </div>
    </div>
  );
}

export function ListPageSkeleton({ tabs = false }: { tabs?: boolean }) {
  return (
    <div>
      <PageHeaderSkeleton />
      {tabs && <Skeleton className="mb-4 h-9 w-full max-w-xl" />}
      <TableSkeleton />
    </div>
  );
}

export function FormPageSkeleton({ sections = 3 }: { sections?: number }) {
  return (
    <div>
      <PageHeaderSkeleton />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {Array.from({ length: sections }, (_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
        <Skeleton className="hidden h-96 rounded-xl lg:block" />
      </div>
    </div>
  );
}
