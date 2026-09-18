import type { Metadata } from "next";
import { connection } from "next/server";
import { FarmsTable } from "@/components/admin/farms/farms-table";
import { FilterTabs } from "@/components/admin/primitives";
import { PageHeader } from "@/components/dashboard/page-header";
import { routes } from "@/config/nav";
import { farmStatusMeta } from "@/config/status";
import type { FarmStatus } from "@/db/schema/marketplace";
import { requireRole } from "@/server/auth/guards";
import { getAdminFarms } from "@/server/queries/admin";
import { readSettingsUncached } from "@/server/queries/settings";

export const metadata: Metadata = { title: "生産者" };

const statuses = Object.keys(farmStatusMeta) as FarmStatus[];

export default async function AdminFarmsPage({ searchParams }: PageProps<"/admin/farms">) {
  await requireRole("admin", routes.admin.farms);
  const sp = await searchParams;
  const status = statuses.find((s) => s === sp.status) ?? "all";
  await connection();
  const [rows, settings] = await Promise.all([getAdminFarms(new Date()), readSettingsUncached()]);
  const count = (s: FarmStatus) => rows.filter((r) => r.status === s).length;
  const filtered = status === "all" ? rows : rows.filter((r) => r.status === status);

  return (
    <>
      <PageHeader title="生産者" description="出店申請の審査、公開・停止、手数料率やおすすめ表示を管理します。" />
      <div className="space-y-4">
        <FilterTabs
          basePath={routes.admin.farms}
          param="status"
          current={status}
          items={[
            { value: "all", label: "すべて", count: rows.length },
            ...statuses.map((s) => ({ value: s, label: farmStatusMeta[s].label, count: count(s) })),
          ]}
        />
        <FarmsTable rows={filtered} platformBps={settings.commissionRateBps} />
      </div>
    </>
  );
}
