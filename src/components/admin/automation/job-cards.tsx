import { BellRing, Clock3, MessageSquareHeart, RefreshCw, TimerOff, Wallet, type LucideIcon } from "lucide-react";
import { Sparkline } from "@/components/charts";
import { ToneBadge } from "@/components/common/status-badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { JobCatalogEntry, JobRunRow } from "@/server/queries/admin";
import { formatJobSummary, jobStatusMeta, jobTriggerMeta } from "../labels";
import { RunJobButton } from "../run-job-button";

const jobIcons: Record<string, LucideIcon> = {
  "cancel-unpaid": TimerOff,
  "ship-reminders": BellRing,
  "sync-tracking": RefreshCw,
  "review-requests": MessageSquareHeart,
  "close-payouts": Wallet,
};

export type JobStats = {
  last: JobRunRow | null;
  runs: number;
  successRate: number | null;
  avgMs: number | null;
  /** rolling success rate (%) over the recent runs, oldest → newest */
  rolling: number[];
};

export function computeJobStats(runs: JobRunRow[], job: string, window = 20): JobStats {
  const mine = runs.filter((r) => r.job === job); // newest first
  const recent = mine.slice(0, window).reverse();
  const ok = recent.filter((r) => r.status === "success").length;
  const rolling = recent.map((_, i) => {
    const slice = recent.slice(Math.max(0, i - 4), i + 1);
    return Math.round((slice.filter((r) => r.status === "success").length / slice.length) * 100);
  });
  const durations = recent.map((r) => r.finishedAt.getTime() - r.startedAt.getTime()).filter((d) => d >= 0);
  return {
    last: mine[0] ?? null,
    runs: mine.length,
    successRate: recent.length ? ok / recent.length : null,
    avgMs: durations.length ? Math.round(durations.reduce((a, d) => a + d, 0) / durations.length) : null,
    rolling,
  };
}

export function JobCard({ job, stats, now }: { job: JobCatalogEntry; stats: JobStats; now: Date }) {
  const I = jobIcons[job.name] ?? Clock3;
  const last = stats.last;
  const healthy = stats.successRate == null || stats.successRate >= 0.95;
  return (
    <Card className="gap-0 py-0">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", healthy ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>
            <I className="size-5" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium">{job.label}</p>
            <p className="text-muted-foreground text-xs leading-relaxed">{job.description}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <ToneBadge tone="neutral">{job.schedule}</ToneBadge>
          {job.cron && <code className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[11px]">{job.cron}</code>}
        </div>
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <div className="space-y-1 text-xs">
            <p className="text-muted-foreground">直近の実行</p>
            {last ? (
              <>
                <div className="flex flex-wrap items-center gap-1.5">
                  <ToneBadge tone={jobStatusMeta[last.status].tone}>{jobStatusMeta[last.status].label}</ToneBadge>
                  <ToneBadge tone={jobTriggerMeta[last.trigger].tone}>{jobTriggerMeta[last.trigger].label}</ToneBadge>
                  <span title={formatDateTime(last.startedAt)}>{formatRelative(last.startedAt, now)}</span>
                </div>
                <p className={cn("line-clamp-2", last.status === "error" ? "text-destructive" : "text-muted-foreground")}>
                  {formatJobSummary(last.summary)}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">まだ実行されていません</p>
            )}
          </div>
          <div className="w-28 text-right">
            <p className="num text-lg leading-none font-semibold">{stats.successRate == null ? "—" : `${Math.round(stats.successRate * 100)}%`}</p>
            <p className="text-muted-foreground mt-1 text-[10px]">成功率（直近{Math.min(stats.runs, 20)}回）</p>
            {stats.rolling.length > 1 && (
              <div className="mt-1">
                <Sparkline values={stats.rolling} color={healthy ? "leaf" : "onion-red"} height={28} />
              </div>
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter className="bg-muted/30 flex items-center justify-between gap-2 border-t px-5 py-3">
        <span className="text-muted-foreground text-[11px]">
          累計 <span className="num">{stats.runs}</span> 回{stats.avgMs != null && <>・平均 <span className="num">{(stats.avgMs / 1000).toFixed(1)}</span> 秒</>}
        </span>
        <RunJobButton
          job={job.name}
          confirm={
            job.name === "close-payouts"
              ? { title: "月次締めを実行しますか？", description: "前月までの配達完了分で精算を作成し、振込予定日を過ぎた分を送金します（冪等）。" }
              : undefined
          }
        />
      </CardFooter>
    </Card>
  );
}
