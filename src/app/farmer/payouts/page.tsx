import { CalendarClock, Landmark, Percent, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { BarBreakdownChart } from "@/components/charts";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { BankAccountCard } from "@/components/farmer/payouts/bank-account-card";
import { InvoiceNumberCard } from "@/components/farmer/payouts/invoice-number-card";
import { PayoutsTable } from "@/components/farmer/payouts/payouts-table";
import { SalesExportCard } from "@/components/farmer/payouts/sales-export-card";
import { StripeConnectCard } from "@/components/farmer/payouts/stripe-connect-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fromYmd } from "@/lib/dates";
import { features } from "@/lib/env";
import { formatDate, formatNumber } from "@/lib/format";
import { requireFarm } from "@/server/auth/guards";
import { getFarmBankAccount, getFarmMonthlyFinance, getUnsettledSummary, listFarmPayouts } from "@/server/queries/farmer";
import { getPlatformSettings } from "@/server/queries/settings";

export const metadata: Metadata = { title: "売上・精算" };

export default async function FarmerPayoutsPage({ searchParams }: PageProps<"/farmer/payouts">) {
  const { farm } = await requireFarm("money");
  const sp = await searchParams;
  await connection();
  const now = new Date();
  const [monthly, payouts, summary, settings, bankAccount] = await Promise.all([
    getFarmMonthlyFinance(farm.id),
    listFarmPayouts(farm.id),
    getUnsettledSummary(farm.id, now),
    getPlatformSettings(),
    getFarmBankAccount(farm.id),
  ]);
  const rateBps = farm.commissionRateBps ?? settings.commissionRateBps;
  const trend = monthly.map((m) => m.gross);
  const prevMonth = monthly.at(-2)?.gross ?? 0;
  const thisMonthDelta = prevMonth > 0 ? (summary.thisMonth.gross - prevMonth) / prevMonth : null;

  return (
    <div className="space-y-6">
      <PageHeader title="売上・精算" description="月末で締めて、翌月にお振込します。手数料は商品代金にだけかかり、送料はそのままお受け取りいただけます。" />

      {sp.stripe === "refresh" && (
        <Alert>
          <Landmark />
          <AlertTitle>登録用のリンクの有効期限が切れました</AlertTitle>
          <AlertDescription>Stripe の登録画面は、開いてから時間がたつと使えなくなります。下の「登録を続ける」をもう一度押してください。入力済みの内容は保存されています。</AlertDescription>
        </Alert>
      )}
      {sp.stripe === "return" && (
        <Alert className="border-leaf/40 bg-leaf/5">
          <Landmark />
          <AlertTitle>振込先の登録ありがとうございます</AlertTitle>
          <AlertDescription>Stripe での確認が終わると、数分で「登録済み」に切り替わります。</AlertDescription>
        </Alert>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="今月の売上見込み" value={summary.thisMonth.gross} format="yen" icon={TrendingUp} trend={trend} delta={thisMonthDelta} hint={`受取見込み ${formatNumber(summary.thisMonth.payout)}円`} />
        <StatCard
          label="次回お振込予定"
          value={summary.next?.amount ?? 0}
          format="yen"
          icon={CalendarClock}
          color="chart-2"
          hint={summary.next?.scheduledFor ? `${formatDate(fromYmd(summary.next.scheduledFor))} 予定` : "予定はありません"}
        />
        <StatCard label="累計お受取額" value={summary.paidTotal} format="yen" icon={Landmark} color="chart-3" hint="振込済みの合計" />
        <StatCard label="販売手数料率" value={rateBps / 10000} format="percent" icon={Percent} color="chart-5" hint="商品代金に対して" />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader>
            <CardTitle>月別の売上と受取額</CardTitle>
            <CardDescription>直近12か月（注文月ベース）</CardDescription>
          </CardHeader>
          <CardContent>
            <BarBreakdownChart
              data={monthly}
              xKey="label"
              series={[
                { key: "gross", label: "商品売上", color: "chart-1" },
                { key: "commission", label: "手数料", color: "chart-4" },
                { key: "payout", label: "受取額", color: "chart-2" },
              ]}
              valueFormat="yen"
              height={300}
            />
          </CardContent>
        </Card>
        <div className="space-y-6">
          <StripeConnectCard stripeEnabled={features.stripe} onboarded={farm.stripeOnboarded} hasAccount={Boolean(farm.stripeAccountId)} />
          <BankAccountCard account={bankAccount} stripeOnboarded={features.stripe && farm.stripeOnboarded} />
          <InvoiceNumberCard value={farm.invoiceRegistrationNumber} />
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="heading-display text-lg">精算の履歴</h2>
        <PayoutsTable rows={payouts} />
      </section>

      <SalesExportCard thisYear={now.getFullYear()} />
    </div>
  );
}
