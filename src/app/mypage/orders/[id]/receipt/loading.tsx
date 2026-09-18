import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <Skeleton className="mx-auto h-[36rem] max-w-3xl rounded-xl" aria-busy />;
}
