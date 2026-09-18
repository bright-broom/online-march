import { Activity, AlarmClock, CircleCheck, OctagonAlert } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { computeJobStats, JobCard } from "@/components/admin/automation/job-cards";
import { CronConfigCard } from "@/components/admin/automation/cron-config";
import { JobRunsTable, type JobRunView } from "@/components/admin/automation/job-runs-table";
import { AutomationPipeline } from "@/components/admin/automation/pipeline";
import { jobStatusMeta } from "@/components/admin/labels";
import { InfoStat, PanelCard } from "@/components/admin/primitives";
import { BarBreakdownChart } from "@/components/charts";
import { StatCard } from "@/components/dashboard/stat-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { routes } from "@/config/nav";
import { addDays, toYmd } from "@/lib/dates";
import { env } from "@/lib/env";
import { formatRelative } from "@/lib/format";
import { requireRole } from "@/server/auth/guards";
import { getJobCatalog, getJobRuns } from "@/server/queries/admin";

export const metadata: Metadata = { title: "配送自動化" };

const DAYS = 14;

export default async function AdminAutomationPage() {
  await requireRole("admin", routes.admin.automation);
  await connection();
  const now = new Date();
  const runs = await getJobRuns(500);
  const catalog = getJobCatalog();
  const labelOf = new Map(catalog.map((j) => [j.name as string, j.label]));

  // last 14 days: runs per day by result
  const today = toYmd(now);
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i - DAYS + 1));
  const perDay = days.map((d) => {
    const list = runs.filter((r) => toYmd(r.startedAt) === d);
    return {
      day: `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`,
      success: list.filter((r) => r.status === "success").length,
      error: list.filter((r) => r.status === "error").length,
    };
  });
  const windowRuns = perDay.reduce((a, d) => a + d.success + d.error, 0);
  const windowErrors = perDay.reduce((a, d) => a + d.error, 0);
  const lastRun = runs[0];

  const views: JobRunView[] = runs.slice(0, 300).map((r) => ({
    id: r.id,
    job: r.job,
    label: labelOf.get(r.job) ?? r.job,
    status: r.status,
    trigger: r.trigger,
    startedAt: r.startedAt,
    durationMs: Math.max(0, r.finishedAt.getTime() - r.startedAt.getTime()),
    summary: r.summary,
  }));

  return (
    <>
      <PageHeader
        title="配送自動化"
        description="注文から発送・配達・レビュー依頼・精算までを自動化するジョブの状態と実行履歴。すべてのジョブは冪等で、手動で再実行しても二重処理されません。"
      />
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="自動化サマリー">
          <StatCard label={`実行回数（${DAYS}日）`} value={windowRuns} icon={Activity} trend={perDay.map((d) => d.success + d.error)} />
          <StatCard
            label={`成功率（${DAYS}日）`}
            value={windowRuns ? (windowRuns - windowErrors) / windowRuns : 1}
            format="percent"
            icon={CircleCheck}
            color="leaf"
          />
          <StatCard label={`失敗（${DAYS}日）`} value={windowErrors} icon={OctagonAlert} color="onion-red" trend={perDay.map((d) => d.error)} />
          <InfoStat
            label="最終実行"
            icon={AlarmClock}
            value={lastRun ? formatRelative(lastRun.startedAt, now) : "—"}
            hint={lastRun ? `${labelOf.get(lastRun.job) ?? lastRun.job}（${jobStatusMeta[lastRun.status].label}）` : "まだ実行されていません"}
          />
        </section>

        <PanelCard title="注文 → 出荷 → 精算の自動化フロー" description="黄色は生産者の操作、それ以外はシステムと Cron が自動で進めます">
          <AutomationPipeline />
        </PanelCard>

        <section aria-labelledby="jobs-heading" className="space-y-3">
          <h2 id="jobs-heading" className="heading-display text-lg">ジョブ</h2>
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {catalog.map((j) => (
              <JobCard key={j.name} job={j} stats={computeJobStats(runs, j.name)} now={now} />
            ))}
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-5">
          <PanelCard title="日別の実行結果" description={`直近${DAYS}日`} className="xl:col-span-2">
            <BarBreakdownChart
              data={perDay}
              xKey="day"
              stacked
              height={260}
              series={[
                { key: "success", label: jobStatusMeta.success.label, color: "chart-2" },
                { key: "error", label: jobStatusMeta.error.label, color: "chart-4" },
              ]}
            />
          </PanelCard>
          <div className="xl:col-span-3">
            <CronConfigCard jobs={catalog} cronSecretConfigured={Boolean(env.CRON_SECRET)} />
          </div>
        </div>

        <PanelCard title="実行履歴" description="job_runs（最新300件）">
          <JobRunsTable rows={views} jobs={catalog.map((j) => ({ name: j.name, label: j.label }))} />
        </PanelCard>
      </div>
    </>
  );
}
