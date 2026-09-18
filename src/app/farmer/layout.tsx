import { Suspense } from "react";
import { FarmStatusBanner } from "@/components/farmer/farm-status-banner";
import { DashboardShell, DashboardShellSkeleton } from "@/components/layout/dashboard-shell";
import { requireFarm } from "@/server/auth/guards";

export default function FarmerLayout({ children }: LayoutProps<"/farmer">) {
  return (
    <Suspense fallback={<DashboardShellSkeleton />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const { user, farm } = await requireFarm();
  return (
    <DashboardShell area="farmer" user={user} context={farm.name} farmId={farm.id}>
      {farm.status !== "active" && <FarmStatusBanner status={farm.status} />}
      {children}
    </DashboardShell>
  );
}
