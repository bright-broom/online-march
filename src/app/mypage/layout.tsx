import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardShell, DashboardShellSkeleton } from "@/components/layout/dashboard-shell";
import { routes } from "@/config/nav";
import { requireRole } from "@/server/auth/guards";

export const metadata: Metadata = { title: { default: "マイページ", template: "%s | マイページ" }, robots: { index: false } };

export default function MypageLayout({ children }: LayoutProps<"/mypage">) {
  return (
    <Suspense fallback={<DashboardShellSkeleton />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const user = await requireRole("customer", routes.mypage.root);
  return (
    <DashboardShell area="mypage" user={user}>
      {children}
    </DashboardShell>
  );
}
