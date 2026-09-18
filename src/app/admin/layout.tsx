import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardShell, DashboardShellSkeleton } from "@/components/layout/dashboard-shell";
import { routes } from "@/config/nav";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: { default: "運営管理", template: "%s | 運営管理" }, robots: { index: false } };

/** 運営 console shell. Auth is request-time → inside Suspense (docs/ARCHITECTURE.md §4). */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<DashboardShellSkeleton />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const user = await requireRole("admin", routes.admin.root);
  return (
    <DashboardShell area="admin" user={user} context="運営管理">
      {children}
    </DashboardShell>
  );
}
