import {
  ClipboardList,
  Coins,
  FileClock,
  JapaneseYen,
  ReceiptText,
  Tractor,
  TruckIcon,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { BarBreakdownChart, DonutChart, TrendChart, type ChartColor, type Slice } from "@/components/charts";
import { roleMeta } from "@/components/admin/labels";
import { PanelCard } from "@/components/admin/primitives";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { categories } from "@/config/catalog";
import { routes } from "@/config/nav";
import { shippingZones } from "@/config/shipping";
import { farmOrderStatusMeta } from "@/config/status";
import type { FarmOrderStatus } from "@/db/schema/marketplace";
import { fromYmd } from "@/lib/dates";
import { formatDate, formatYen } from "@/lib/format";
import type { PeriodDays } from "@/lib/validators/admin";
import { getAdminAnalytics } from "@/server/queries/admin";

const categoryColors: ChartColor[] = ["chart-1", "chart-2", "chart-4", "chart-3", "chart-5"];

/** KPI tiles + charts. Data comes from the cached analytics query (period × hour). */
export async function OverviewAnalytics({ period, nowIso }: { period: PeriodDays; nowIso: string }) {
  const a = await getAdminAnalytics(period, nowIso);
  const hint = `前${period}日比`;
  const k = a.kpis;

  const categorySlices: Slice[] = a.categoryBreakdown
    .filter((c) => c.amount > 0)
    .map((c, i) => ({ key: c.key, label: categories[c.key].label, value: c.amount, color: categoryColors[i % categoryColors.length] }));
  const statusOrder = Object.keys(farmOrderStatusMeta) as FarmOrderStatus[];
  const statusData = statusOrder
    .map((s) => ({ label: farmOrderStatusMeta[s].label, count: a.statusBreakdown.find((r) => r.status === s)?.count ?? 0 }))
    .filter((r) => r.count > 0);
  const zoneData = a.zoneBreakdown.map((z) => ({ label: shippingZones[z.key].label, orders: z.orders, amount: z.amount }));
  const topZone = [...a.zoneBreakdown].sort((x, y) => y.orders - x.orders)[0];

  return (
    <div className="space-y-6">
      <section aria-label="主要指標" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="流通総額（GMV）" value={k.gmv.value} format="yen" delta={k.gmv.delta} trend={k.gmv.trend} icon={JapaneseYen} hint={hint} color="chart-1" />
        <StatCard label="手数料収益" value={k.commission.value} format="yen" delta={k.commission.delta} trend={k.commission.trend} icon={Coins} hint={hint} color="chart-3" />
        <StatCard label="注文数" value={k.orders.value} delta={k.orders.delta} trend={k.orders.trend} icon={ClipboardList} hint={hint} color="chart-2" />
        <StatCard label="平均注文額" value={k.aov.value} format="yen" delta={k.aov.delta} trend={k.aov.trend} icon={ReceiptText} hint={hint} color="chart-5" />
        <StatCard label="新規会員" value={k.newUsers.value} delta={k.newUsers.delta} trend={k.newUsers.trend} icon={UserPlus} hint={hint} color="leaf" />
        <StatCard label="稼働農家数" value={k.activeFarms.value} delta={k.activeFarms.delta} icon={Tractor} hint="期間内に売上のあった生産者" />
        <StatCard label="配送遅延件数" value={k.overdueShipments} icon={TruckIcon} hint="出荷期限を過ぎた未発送（現在）" color="onion-red" />
        <StatCard label="未処理申請" value={k.pendingFarms} icon={FileClock} hint="審査待ちの出店申請（現在）" />
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <PanelCard
          title="流通総額と手数料の推移"
          description={`${formatDate(fromYmd(a.range.start))} 〜 ${formatDate(fromYmd(a.range.end))}（日別・支払完了ベース）`}
          className="xl:col-span-2"
        >
          <TrendChart
            data={a.trend}
            xKey="date"
            valueFormat="yen"
            series={[
              { key: "gmv", label: "流通総額", color: "chart-1" },
              { key: "commission", label: "手数料", color: "chart-3" },
            ]}
            height={300}
          />
        </PanelCard>
        <PanelCard title="カテゴリ別構成" description="商品代金ベース">
          {categorySlices.length ? (
            <DonutChart data={categorySlices} valueFormat="yen" centerLabel="商品売上" height={300} />
          ) : (
            <EmptyChart />
          )}
        </PanelCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PanelCard
          title="生産者別売上ランキング"
          description="流通総額 上位8軒"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href={routes.admin.farms}>生産者一覧</Link>
            </Button>
          }
        >
          {a.ranking.length ? (
            <BarBreakdownChart
              data={a.ranking.map((r) => ({ name: r.name, gmv: r.gmv }))}
              xKey="name"
              layout="horizontal-bars"
              valueFormat="yen"
              series={[{ key: "gmv", label: "流通総額", color: "chart-1" }]}
              height={Math.max(200, a.ranking.length * 38)}
            />
          ) : (
            <EmptyChart />
          )}
        </PanelCard>
        <PanelCard
          title="地域別注文"
          description={topZone && topZone.orders > 0 ? `最多は${shippingZones[topZone.key].label}（${topZone.orders}件・${formatYen(topZone.amount)}）` : "お届け先の配送ゾーン別"}
        >
          <BarBreakdownChart data={zoneData} xKey="label" series={[{ key: "orders", label: "注文数", color: "chart-3" }]} height={Math.max(200, a.ranking.length * 38)} />
        </PanelCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PanelCard title="注文ステータス内訳" description="期間内に作成された出荷単位（farm_orders）">
          {statusData.length ? (
            <BarBreakdownChart data={statusData} xKey="label" series={[{ key: "count", label: "件数", color: "chart-2" }]} height={260} />
          ) : (
            <EmptyChart />
          )}
        </PanelCard>
        <PanelCard title="月別新規会員" description="直近12か月（現在のロール別）">
          <BarBreakdownChart
            data={a.members.map((m) => ({ month: `${Number(m.month.slice(5))}月`, customer: m.customer, farmer: m.farmer }))}
            xKey="month"
            stacked
            series={[
              { key: "customer", label: roleMeta.customer.label, color: "chart-2" },
              { key: "farmer", label: roleMeta.farmer.label, color: "chart-1" },
            ]}
            height={260}
          />
        </PanelCard>
      </div>
    </div>
  );
}

function EmptyChart() {
  return <div className="text-muted-foreground flex h-[240px] items-center justify-center text-sm">この期間のデータはまだありません</div>;
}
