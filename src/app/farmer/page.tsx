import type { Metadata } from "next";
import { connection } from "next/server";
import { BarBreakdownChart, DonutChart, type ChartColor } from "@/components/charts";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { FarmerAnnouncements } from "@/components/farmer/overview/announcements";
import { LatestReviews, UpcomingShipments } from "@/components/farmer/overview/overview-panels";
import { SalesTrendCard } from "@/components/farmer/overview/sales-trend-card";
import { SetupChecklist } from "@/components/farmer/overview/setup-checklist";
import { TodoCards } from "@/components/farmer/overview/todo-cards";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toYmd } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { requireFarm } from "@/server/auth/guards";
import { getFarmAnalytics, getFarmerAnnouncements, getFarmSetup, getFarmTodos, getLatestReviews, getUpcomingShipments } from "@/server/queries/farmer";

export const metadata: Metadata = { title: "生産者ダッシュボード" };

const regionColors: ChartColor[] = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"];

function greeting(now: Date) {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", hour: "numeric", hourCycle: "h23" }).format(now));
  return h < 10 ? "おはようございます" : h < 18 ? "こんにちは" : "おつかれさまです";
}

export default async function FarmerOverviewPage() {
  const { user, farm } = await requireFarm("money");
  await connection();
  const now = new Date();
  const today = toYmd(now);
  const [analytics, todos, upcoming, latestReviews, notices, setup] = await Promise.all([
    getFarmAnalytics(farm.id),
    getFarmTodos(farm.id, today),
    getUpcomingShipments(farm.id),
    getLatestReviews(farm.id),
    getFarmerAnnouncements(),
    getFarmSetup(farm),
  ]);
  const { kpi } = analytics;

  // region donut: top 4 zones + その他
  const top = analytics.regions.slice(0, 4);
  const rest = analytics.regions.slice(4).reduce((a, r) => a + r.value, 0);
  const regionSlices = [...top.map((r) => ({ key: r.key, label: r.label, value: r.value })), ...(rest > 0 ? [{ key: "other", label: "その他", value: rest }] : [])].map(
    (s, i) => ({ ...s, color: regionColors[i] }),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting(now)}、${user.name.split(" ")[0]}さん`}
        description={`${formatDate(now)}｜${farm.name}の今日のようすです。`}
      />

      <SetupChecklist setup={setup} />

      <FarmerAnnouncements items={notices} />

      <section aria-label="今日のやること" className="space-y-3">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wider">今日のやること</h2>
        <TodoCards todos={todos} setupPending={!(setup.product && setup.payout && setup.shop)} />
      </section>

      <section aria-label="直近30日の実績" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="売上（30日）" value={kpi.sales.value} format="yen" delta={kpi.sales.delta} hint="前30日比" />
        <StatCard label="注文数（30日）" value={kpi.orders.value} delta={kpi.orders.delta} hint="前30日比" />
        <StatCard label="平均客単価" value={kpi.aov.value} format="yen" delta={kpi.aov.delta} hint="前30日比" />
        <StatCard label="評価" value={kpi.rating.value} delta={kpi.rating.delta} hint={`${kpi.rating.count}件のレビュー`} />
      </section>

      <SalesTrendCard daily={analytics.daily} weekly={analytics.weekly} />

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>商品別売上</CardTitle>
            <CardDescription>直近90日・上位8商品</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.products.length ? (
              <BarBreakdownChart
                data={analytics.products.map((p) => ({ name: p.name, sales: p.sales }))}
                xKey="name"
                series={[{ key: "sales", label: "売上", color: "chart-1" }]}
                valueFormat="yen"
                layout="horizontal-bars"
                height={Math.max(160, analytics.products.length * 40)}
              />
            ) : (
              <p className="text-muted-foreground py-12 text-center text-sm">まだ売上がありません</p>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>地域別の売上</CardTitle>
            <CardDescription>お届け先の配送ゾーン別・直近90日</CardDescription>
          </CardHeader>
          <CardContent>
            {regionSlices.length ? (
              <DonutChart data={regionSlices} valueFormat="yen" centerLabel="売上" />
            ) : (
              <p className="text-muted-foreground py-12 text-center text-sm">まだ売上がありません</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>月次の入金予定</CardTitle>
            <CardDescription>確定済みの精算と、未精算分の見込み</CardDescription>
          </CardHeader>
          <CardContent>
            <BarBreakdownChart
              data={analytics.payoutSchedule}
              xKey="label"
              series={[
                { key: "confirmed", label: "確定", color: "chart-2" },
                { key: "projected", label: "見込み", color: "chart-5" },
              ]}
              valueFormat="yen"
              stacked
              height={240}
            />
          </CardContent>
        </Card>
        <UpcomingShipments rows={upcoming} today={today} />
        <LatestReviews rows={latestReviews} now={now} />
      </div>
    </div>
  );
}
