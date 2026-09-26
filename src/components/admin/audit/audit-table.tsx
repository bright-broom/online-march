"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/dashboard/data-table";
import { Badge } from "@/components/ui/badge";
import { auditActions, type AuditAction } from "@/config/audit";
import { formatDateTime } from "@/lib/format";

export type AuditRow = { id: string; createdAt: Date; actorEmail: string; action: string; summary: string };

const label = (a: string) => auditActions[a as AuditAction] ?? a;

const columns: ColumnDef<AuditRow>[] = [
  {
    accessorKey: "createdAt",
    header: "日時",
    cell: ({ row: { original: r } }) => <span className="text-xs whitespace-nowrap">{formatDateTime(r.createdAt)}</span>,
  },
  { accessorKey: "actorEmail", header: "操作した人", cell: ({ getValue }) => <span className="text-xs break-all">{String(getValue())}</span> },
  {
    id: "action",
    accessorFn: (r) => label(r.action),
    header: "操作",
    cell: ({ getValue }) => <Badge variant="secondary" className="whitespace-nowrap">{String(getValue())}</Badge>,
  },
  { accessorKey: "summary", header: "内容", cell: ({ getValue }) => <span className="text-sm">{String(getValue())}</span> },
];

/** 運営の操作記録（#19）。検索は操作した人・操作・内容のすべてに効く */
export function AuditTable({ rows }: { rows: AuditRow[] }) {
  return <DataTable columns={columns} data={rows} getRowId={(r) => r.id} pageSize={50} searchPlaceholder="操作した人・操作・内容で検索" emptyText="記録はまだありません" />;
}
