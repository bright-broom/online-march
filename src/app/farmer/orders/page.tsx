import { Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { LinkTabs } from "@/components/farmer/link-tabs";
import { OrdersTable } from "@/components/farmer/orders/orders-table";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/nav";
import { farmOrderStatusMeta } from "@/config/status";
import { toYmd } from "@/lib/dates";
import { requireFarm } from "@/server/auth/guards";
import { getFarmOrderCounts, listFarmOrders, orderTabStatuses, type OrderTab } from "@/server/queries/farmer";

export const metadata: Metadata = { title: "受注管理" };

export default async function FarmerOrdersPage({ searchParams }: PageProps<"/farmer/orders">) {
  const { farm } = await requireFarm();
  const sp = await searchParams;
  const tab: OrderTab = (orderTabStatuses as readonly string[]).includes(String(sp.tab)) ? (String(sp.tab) as OrderTab) : "paid";
  await connection();
  const today = toYmd(new Date());
  const [counts, rows] = await Promise.all([getFarmOrderCounts(farm.id), listFarmOrders(farm.id, tab)]);

  return (
    <div>
      <PageHeader
        title="受注管理"
        description="ご注文の確認・出荷準備・発送までをここで管理します。"
        actions={
          <Button asChild variant="outline">
            <Link href={routes.farmer.shipping}><Truck />出荷センターへ</Link>
          </Button>
        }
      />
      <LinkTabs
        className="mb-4"
        active={tab}
        tabs={orderTabStatuses.map((s) => ({
          key: s,
          label: farmOrderStatusMeta[s].label,
          count: counts[s] ?? 0,
          highlight: s === "paid",
          href: `${routes.farmer.orders}?tab=${s}`,
        }))}
      />
      <OrdersTable rows={rows} today={today} showShipBy={tab === "paid" || tab === "preparing"} />
    </div>
  );
}
