import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Mirrors <PageIntro> to avoid layout shift while a route streams. */
export function PageIntroSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("container-page pt-8 pb-10 sm:pt-10 sm:pb-12", className)}>
      <Skeleton className="h-3 w-40" />
      <div className="mt-8 max-w-3xl space-y-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-2/3 sm:h-12" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
    </div>
  );
}

/** Mirrors <ImageHero>. */
export function ImageHeroSkeleton() {
  return (
    <div className="bg-muted flex min-h-[60svh] items-end">
      <div className="container-page w-full space-y-4 pb-12 sm:pb-16">
        <Skeleton className="bg-background/40 h-3 w-24" />
        <Skeleton className="bg-background/40 h-12 w-2/3 max-w-lg" />
        <Skeleton className="bg-background/40 h-4 w-full max-w-md" />
      </div>
    </div>
  );
}

export function ProseSkeleton({ lines = 6 }: { lines?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-4", i % 3 === 2 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}
