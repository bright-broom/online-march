import { CalendarClock, Coins, Landmark } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { PayoutsTable } from "@/components/admin/payouts/payouts-table";
import { FilterTabs, PanelCard } from "@/components/admin/primitives";
import { RunJobButton } from "@/components/admin/run-job-button";
import { BarBreakdownChart } from "@/components/charts";
import { StatCard } from "@/components/dashboard/stat-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { feeConfig } from "@/config/fees";
import { routes } from "@/config/nav";
import { payoutStatusMeta } from "@/config/status";
import type { PayoutStatus } from "@/db/schema/marketplace";
import { formatYen } from "@/lib/format";
import { requireRole } from "@/server/auth/guards";
import { getAdminPayouts } from "@/server/queries/admin";

export const metadata: Metadata = { title: "精算・振込" };

// processing は使っていない値（db/schema の payoutStatus の説明）なので、絞り込みにも出さない
const statuses = (Object.keys(payoutStatusMeta) as PayoutStatus[]).filter((s) => s !== "processing");

export default async function AdminPayoutsPage({ searchParams }: PageProps<"/admin/payouts">) {
  await requireRole("admin", routes.admin.payouts);
  const sp = await searchParams;
  const status = statuses.find((s) => s === sp.status);
  await connection();
  const { list, summary } = await getAdminPayouts(new Date());
  const rows = status ? list.filter((p) => p.status === status) : list;

  // monthly closing volume (by period end), last 12 closings
  const byMonth = new Map<string, { month: string; paid: number; scheduled: number; commission: number }>();
  for (const p of list) {
    const m = p.periodEnd.slice(0, 7);
    const e = byMonth.get(m) ?? { month: `${Number(m.slice(5))}月`, paid: 0, scheduled: 0, commission: 0 };
    if (p.status === "paid") e.paid += p.amount;
    else e.scheduled += p.amount;
    e.commission += p.commission;
    byMonth.set(m, e);
  }
  const chart = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([, v]) => v);

  return (
    <>
      <PageHeader
        title="精算・振込"
        description={`毎月末締め・翌月${feeConfig.payout.payoutDay}日払い。最低振込額 ${formatYen(feeConfig.payout.minimumAmount)}（未満は翌月へ繰越）。Stripe 未登録の生産者は銀行振込後に「振込済み」にしてください。`}
        actions={
          <RunJobButton
            job="close-payouts"
            label="月次締めを実行"
            variant="default"
            confirm={{
              title: "月次締めを実行しますか？",
              description: "前月までに配達完了した未精算の売上を生産者ごとに締めて精算を作成し、振込予定日を過ぎた Stripe 登録済みの精算を送金します。何度実行しても二重に作成されません。",
            }}
          />
        }
      />
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-3" aria-label="精算サマリー">
          <StatCard label="振込予定総額" value={summary.scheduledTotal} format="yen" icon={CalendarClock} hint={`${summary.scheduledCount}件`} />
          <StatCard label="今月振込済み" value={summary.paidThisMonth} format="yen" icon={Landmark} color="leaf" />
          <StatCard label="手数料収益" value={summary.commissionThisYear} format="yen" icon={Coins} hint={`今年の精算分・累計 ${formatYen(summary.commissionTotal)}`} />
        </section>
        {chart.length > 0 && (
          <PanelCard title="月次精算の推移" description="対象月別の振込額（振込済み / 振込予定）">
            <BarBreakdownChart
              data={chart}
              xKey="month"
              stacked
              valueFormat="yen"
              height={240}
              series={[
                { key: "paid", label: payoutStatusMeta.paid.label, color: "chart-2" },
                { key: "scheduled", label: payoutStatusMeta.pending.label, color: "chart-1" },
              ]}
            />
          </PanelCard>
        )}
        <div className="space-y-4">
          <FilterTabs
            basePath={routes.admin.payouts}
            param="status"
            current={status ?? "all"}
            items={[
              { value: "all", label: "すべて", count: list.length },
              ...statuses.map((s) => ({ value: s, label: payoutStatusMeta[s].label, count: list.filter((p) => p.status === s).length })),
            ]}
          />
          <PayoutsTable rows={rows} />
        </div>
      </div>
    </>
  );
}
