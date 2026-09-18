import { Skeleton } from "@/components/ui/skeleton";

export function CheckoutSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]" aria-busy>
      <div className="space-y-5">
        {[220, 280, 160].map((h, i) => (
          <div key={i} className="bg-card space-y-4 rounded-2xl border p-5 sm:p-7">
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-6 w-40" />
            </div>
            <Skeleton className="w-full rounded-xl" style={{ height: h }} />
          </div>
        ))}
      </div>
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  );
}
