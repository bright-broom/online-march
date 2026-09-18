import { Store } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/nav";
import type { SessionUser } from "@/server/auth/session";
import { getBadgeCounts, getRecentNotifications } from "@/server/queries/badges";
import { AppSidebar, type DashboardArea } from "./app-sidebar";
import { DashboardBreadcrumbs } from "./dashboard-breadcrumbs";
import { NotificationsPopover } from "./notifications-popover";
import { ThemeToggle } from "./theme-toggle";

/**
 * Authenticated app shell (sidebar + top bar). Async: render inside <Suspense fallback={<DashboardShellSkeleton/>}>
 * from the area layout after the auth guard. See app/farmer/layout.tsx for the pattern.
 */
export async function DashboardShell({
  area, user, context, farmId, children,
}: { area: DashboardArea; user: SessionUser; context?: string; farmId?: string; children: React.ReactNode }) {
  const [badges, notifications] = await Promise.all([getBadgeCounts(user, farmId), getRecentNotifications(user.id)]);
  return (
    <SidebarProvider>
      <AppSidebar area={area} user={{ name: user.name, email: user.email, role: user.role }} context={context} badges={badges} />
      <SidebarInset className="min-w-0 print:m-0 print:shadow-none">
        <header className="no-print bg-background/80 sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur-md md:rounded-t-xl">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <DashboardBreadcrumbs area={area} />
          <div className="ml-auto flex items-center gap-1">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href={routes.home}><Store />ストア</Link>
            </Button>
            <ThemeToggle />
            <NotificationsPopover items={notifications} unread={badges.unreadNotifications ?? 0} />
          </div>
        </header>
        <div className="flex-1 p-4 md:p-6 lg:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export function DashboardShellSkeleton() {
  return (
    <div className="flex min-h-svh">
      <div className="bg-sidebar hidden w-64 shrink-0 space-y-3 p-4 md:block">
        <Skeleton className="h-10 w-40" />
        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
      <div className="flex-1 space-y-6 p-8">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
