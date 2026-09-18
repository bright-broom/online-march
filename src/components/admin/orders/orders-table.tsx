"use client";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Price } from "@/components/common/price";
import { StatusBadge, ToneBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/dashboard/data-table";
import { routes } from "@/config/nav";
import { formatDateTime } from "@/lib/format";
import type { AdminOrderRow } from "@/server/queries/admin";
import { paymentProviderMeta } from "../labels";

export function OrdersTable({ rows }: { rows: AdminOrderRow[] }) {
  const columns: ColumnDef<AdminOrderRow>[] = [
    {
      accessorKey: "code",
      header: "注文番号",
      cell: ({ row: { original: o } }) => (
        <Link href={routes.admin.order(o.id)} className="num font-medium whitespace-nowrap hover:underline">{o.code}</Link>
      ),
    },
    {
      id: "createdAt",
      accessorFn: (o) => o.createdAt.valueOf(),
      header: "注文日時",
      cell: ({ row: { original: o } }) => <span className="text-muted-foreground text-xs whitespace-nowrap">{formatDateTime(o.createdAt)}</span>,
    },
    {
      id: "customer",
      accessorFn: (o) => `${o.customerName} ${o.email}`,
      header: "お客さま",
      cell: ({ row: { original: o } }) => (
        <div className="max-w-52">
          <p className="truncate">{o.customerName}</p>
          <p className="text-muted-foreground truncate text-xs">{o.email}</p>
        </div>
      ),
    },
    { accessorKey: "prefecture", header: "お届け先", cell: ({ getValue }) => <span className="text-xs whitespace-nowrap">{String(getValue() ?? "—")}</span> },
    {
      accessorKey: "farmCount",
      header: "生産者",
      cell: ({ row: { original: o } }) => (
        <span className="num whitespace-nowrap">
          {o.farmCount}
          {o.openCount > 0 && <span className="text-muted-foreground ml-1 text-[11px]">（未完了 {o.openCount}）</span>}
        </span>
      ),
    },
    { accessorKey: "total", header: "合計", cell: ({ getValue }) => <Price amount={Number(getValue())} size="sm" showTax={false} /> },
    {
      accessorKey: "paymentProvider",
      header: "決済",
      cell: ({ row: { original: o } }) => {
        const m = paymentProviderMeta[o.paymentProvider] ?? { label: o.paymentProvider, tone: "neutral" as const };
        return <ToneBadge tone={m.tone}>{m.label}</ToneBadge>;
      },
    },
    { accessorKey: "status", header: "状態", cell: ({ row: { original: o } }) => <StatusBadge kind="order" status={o.status} /> },
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      pageSize={25}
      searchPlaceholder="注文番号・お客さま・メール・都道府県で検索"
      emptyText="該当する注文はありません"
    />
  );
}
