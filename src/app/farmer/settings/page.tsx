import type { Metadata } from "next";
import { connection } from "next/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { ShippingSettingsForm } from "@/components/farmer/settings/shipping-settings-form";
import { requireFarm } from "@/server/auth/guards";

export const metadata: Metadata = { title: "出荷・配送設定" };

export default async function FarmerSettingsPage() {
  const { farm } = await requireFarm();
  await connection();
  const nowIso = new Date().toISOString();
  return (
    <div>
      <PageHeader title="出荷・配送設定" description="配送業者・出荷日程・送料無料ラインを設定します。右側のプレビューで、お客さまからの見え方を確かめられます。" />
      <ShippingSettingsForm
        nowIso={nowIso}
        initial={{
          defaultCarrier: farm.defaultCarrier,
          leadTimeDays: farm.leadTimeDays,
          shipWeekdays: [...farm.shipWeekdays].sort((a, b) => a - b),
          freeShippingEnabled: farm.freeShippingThreshold != null,
          freeShippingThreshold: farm.freeShippingThreshold != null ? String(farm.freeShippingThreshold) : "",
        }}
      />
    </div>
  );
}
