import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FarmHeaderActions } from "@/components/admin/farms/farm-actions";
import { FarmDetailView } from "@/components/admin/farms/farm-detail";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/nav";
import { requireRole } from "@/server/auth/guards";
import { getAdminFarmDetail, getFarmSalesSeries } from "@/server/queries/admin";
import { readSettingsUncached } from "@/server/queries/settings";

export const metadata: Metadata = { title: "生産者の詳細" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminFarmDetailPage({ params }: PageProps<"/admin/farms/[id]">) {
  const { id } = await params;
  await requireRole("admin", routes.admin.farm(id));
  if (!UUID.test(id)) notFound();
  await connection();
  const now = new Date();
  const hour = new Date(now);
  hour.setMinutes(0, 0, 0);
  const [data, series, settings] = await Promise.all([
    getAdminFarmDetail(id, now),
    getFarmSalesSeries(id, hour.toISOString()),
    readSettingsUncached(),
  ]);
  if (!data) notFound();
  const { farm } = data;

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="text-muted-foreground mb-2 -ml-2">
        <Link href={routes.admin.farms}><ArrowLeft />生産者一覧</Link>
      </Button>
      <PageHeader
        title={farm.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge kind="farm" status={farm.status} />
            {farm.representative}・{farm.prefecture}{farm.city}
          </span>
        }
        actions={
          <FarmHeaderActions
            farm={{ id: farm.id, name: farm.name, slug: farm.slug, status: farm.status, isFeatured: farm.isFeatured, commissionRateBps: farm.commissionRateBps }}
            platformBps={settings.commissionRateBps}
          />
        }
      />
      <FarmDetailView data={data} series={series} platformBps={settings.commissionRateBps} />
    </>
  );
}
