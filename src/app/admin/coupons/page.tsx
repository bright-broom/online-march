import type { Metadata } from "next";
import { connection } from "next/server";
import { CouponsManager, type CouponRow } from "@/components/admin/content/coupons-manager";
import { couponPhase } from "@/components/admin/labels";
import { PageHeader } from "@/components/dashboard/page-header";
import { routes } from "@/config/nav";
import { toYmd } from "@/lib/dates";
import { requireRole } from "@/server/auth/guards";
import { getAdminCoupons } from "@/server/queries/admin";

export const metadata: Metadata = { title: "クーポン" };

export default async function AdminCouponsPage() {
  await requireRole("admin", routes.admin.coupons);
  await connection();
  const now = new Date();
  const coupons = await getAdminCoupons();
  const rows: CouponRow[] = coupons.map((c) => ({
    id: c.id,
    code: c.code,
    description: c.description,
    type: c.type,
    value: c.value,
    minSubtotal: c.minSubtotal,
    maxUses: c.maxUses,
    usedCount: c.usedCount,
    startsYmd: c.startsAt ? toYmd(c.startsAt) : null,
    endsYmd: c.endsAt ? toYmd(c.endsAt) : null,
    isActive: c.isActive,
    phase: couponPhase(c, now),
  }));
  const live = rows.filter((r) => r.phase === "active").length;
  const used = rows.reduce((a, r) => a + r.usedCount, 0);

  return (
    <>
      <PageHeader
        title="クーポン"
        description={`利用可能 ${live}件・累計利用 ${used}回。コードは大文字英数字で、チェックアウトで入力されます。`}
      />
      <CouponsManager rows={rows} />
    </>
  );
}
