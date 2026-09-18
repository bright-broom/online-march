import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AttentionPanel } from "@/components/admin/overview/attention-panel";
import { OverviewAnalytics } from "@/components/admin/overview/overview-analytics";
import { PeriodSwitch } from "@/components/admin/overview/period-switch";
import { RecentOrders } from "@/components/admin/overview/recent-orders";
import { KpiSkeleton, TableSkeleton } from "@/components/admin/primitives";
import { PageHeader } from "@/components/dashboard/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/nav";
import { parsePeriod } from "@/lib/validators/admin";
import { requireRole } from "@/server/auth/guards";
import { getAdminAttention, getAdminOrders } from "@/server/queries/admin";

export const metadata: Metadata = { title: "ダッシュボード" };

export default async function AdminOverviewPage({ searchParams }: PageProps<"/admin">) {
  await requireRole("admin", routes.admin.root);
  const period = parsePeriod((await searchParams).period);
  await connection();
  // Rounded to the hour so the cached analytics entry is shared by every request in that hour.
  const hour = new Date();
  hour.setMinutes(0, 0, 0);

  return (
    <>
      <PageHeader
        title="ダッシュボード"
        description="マーケットプレイス全体の売上・注文・生産者の動きをひと目で。"
        actions={<PeriodSwitch current={period} />}
      />
      <div className="space-y-8">
        <Suspense key={period} fallback={<AnalyticsSkeleton />}>
          <OverviewAnalytics period={period} nowIso={hour.toISOString()} />
        </Suspense>
        <Suspense fallback={<TableSkeleton rows={4} />}>
          <Attention />
        </Suspense>
        <Suspense fallback={<TableSkeleton rows={6} />}>
          <Recent />
        </Suspense>
      </div>
    </>
  );
}

async function Attention() {
  await connection();
  const now = new Date();
  const data = await getAdminAttention(now);
  return <AttentionPanel data={data} now={now} />;
}

async function Recent() {
  const { rows } = await getAdminOrders(undefined, 8);
  return <RecentOrders rows={rows} />;
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <KpiSkeleton count={8} />
      <div className="grid gap-4 xl:grid-cols-3">
        <Skeleton className="h-[372px] rounded-xl xl:col-span-2" />
        <Skeleton className="h-[372px] rounded-xl" />
      </div>
    </div>
  );
}
