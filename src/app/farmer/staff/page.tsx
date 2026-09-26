import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { StaffManager } from "@/components/farmer/staff/staff-manager";
import { farmStaffPolicy } from "@/config/farm-staff";
import { requireFarm } from "@/server/auth/guards";
import { listFarmStaff } from "@/server/queries/farmer";

export const metadata: Metadata = { title: "スタッフ" };

/** 農園のスタッフ（#24）。オーナーだけ */
export default async function FarmerStaffPage() {
  const { farm } = await requireFarm("staff");
  await connection();
  const rows = await listFarmStaff(farm.id);
  return (
    <div className="space-y-6">
      <PageHeader
        title="スタッフ"
        description={`出荷や商品の管理を手伝ってもらう人を${farmStaffPolicy.maxMembers}人まで招待できます。売上と精算・振込先口座はオーナーだけが見られます。`}
      />
      <StaffManager rows={rows} nowIso={new Date().toISOString()} />
    </div>
  );
}
