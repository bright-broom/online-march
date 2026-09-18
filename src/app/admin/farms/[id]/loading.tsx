import { PageSkeleton } from "@/components/admin/primitives";

export default function Loading() {
  return <PageSkeleton kpis={4} chart rows={6} />;
}
