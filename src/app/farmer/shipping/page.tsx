import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { CarrierTips } from "@/components/farmer/shipping/carrier-tips";
import { ShippingCenter } from "@/components/farmer/shipping/shipping-center";
import { toYmd } from "@/lib/dates";
import { requireFarm } from "@/server/auth/guards";
import { getShippingQueue } from "@/server/queries/farmer";

export const metadata: Metadata = { title: "出荷センター" };

export default async function ShippingCenterPage() {
  const { farm } = await requireFarm();
  await connection();
  const today = toYmd(new Date());
  const rows = await getShippingQueue(farm.id);
  return (
    <div className="space-y-6">
      <PageHeader
        title="出荷センター"
        description="準備 → 送り状 → 追跡番号 の3ステップ。発送メールは自動でお客さまに届きます。"
      />
      <ShippingCenter rows={rows} today={today} defaultCarrier={farm.defaultCarrier} />
      <CarrierTips defaultCarrier={farm.defaultCarrier} />
    </div>
  );
}
