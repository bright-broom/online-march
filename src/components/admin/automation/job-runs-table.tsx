"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { ToneBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/dashboard/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatJobSummary, jobStatusMeta, jobTriggerMeta } from "../labels";

export type JobRunView = {
  id: string;
  job: string;
  label: string;
  status: "success" | "error";
  trigger: "cron" | "manual" | "webhook";
  startedAt: Date;
  durationMs: number;
  summary: Record<string, unknown>;
};

const ALL = "all";

export function JobRunsTable({ rows, jobs }: { rows: JobRunView[]; jobs: { name: string; label: string }[] }) {
  const [job, setJob] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const data = useMemo(() => rows.filter((r) => (job === ALL || r.job === job) && (status === ALL || r.status === status)), [rows, job, status]);
  const columns: ColumnDef<JobRunView>[] = [
    {
      id: "startedAt",
      accessorFn: (r) => r.startedAt.valueOf(),
      header: "開始",
      cell: ({ row: { original: r } }) => <span className="num text-xs whitespace-nowrap">{formatDateTime(r.startedAt)}</span>,
    },
    { accessorKey: "label", header: "ジョブ", cell: ({ getValue }) => <span className="text-sm whitespace-nowrap">{String(getValue())}</span> },
    { accessorKey: "trigger", header: "起動", cell: ({ row: { original: r } }) => <ToneBadge tone={jobTriggerMeta[r.trigger].tone}>{jobTriggerMeta[r.trigger].label}</ToneBadge> },
    { accessorKey: "status", header: "結果", cell: ({ row: { original: r } }) => <ToneBadge tone={jobStatusMeta[r.status].tone}>{jobStatusMeta[r.status].label}</ToneBadge> },
    {
      accessorKey: "durationMs",
      header: "所要",
      cell: ({ row: { original: r } }) => <span className="num text-xs">{r.durationMs < 1000 ? `${r.durationMs}ms` : `${(r.durationMs / 1000).toFixed(1)}s`}</span>,
    },
    {
      id: "summary",
      accessorFn: (r) => formatJobSummary(r.summary),
      header: "サマリー",
      enableSorting: false,
      cell: ({ row: { original: r } }) => (
        <details className="group max-w-md">
          <summary className={cn("cursor-pointer list-none text-xs", r.status === "error" ? "text-destructive" : "text-muted-foreground")}>
            {formatJobSummary(r.summary)}
            <span className="text-primary ml-1.5 group-open:hidden">JSON</span>
          </summary>
          <pre className="bg-muted mt-2 overflow-x-auto rounded-lg p-2 font-mono text-[11px] leading-relaxed">{JSON.stringify(r.summary, null, 2)}</pre>
        </details>
      ),
    },
  ];
  return (
    <DataTable
      columns={columns}
      data={data}
      getRowId={(r) => r.id}
      pageSize={15}
      searchPlaceholder={false}
      emptyText="実行履歴はまだありません"
      toolbar={
        <>
          <Select value={job} onValueChange={setJob}>
            <SelectTrigger size="sm" className="w-48" aria-label="ジョブ"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>すべてのジョブ</SelectItem>
              {jobs.map((j) => (
                <SelectItem key={j.name} value={j.name}>{j.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger size="sm" className="w-28" aria-label="結果"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>すべての結果</SelectItem>
              {(Object.keys(jobStatusMeta) as (keyof typeof jobStatusMeta)[]).map((s) => (
                <SelectItem key={s} value={s}>{jobStatusMeta[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      }
    />
  );
}
