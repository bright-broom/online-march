import { PageSkeleton } from "@/components/admin/primitives";

export default function Loading() {
  return <PageSkeleton kpis={3} chart rows={8} />;
}
