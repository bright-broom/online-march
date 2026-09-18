import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[210mm] space-y-6">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="aspect-[210/297] w-full rounded-xl" />
    </div>
  );
}
