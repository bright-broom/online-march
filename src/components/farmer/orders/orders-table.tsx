"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { Gift } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/dashboard/data-table";
import { Badge } from "@/components/ui/badge";
import { orderCancelCopy } from "@/config/order-cancel";
import { routes } from "@/config/nav";
import type { YMD } from "@/lib/dates";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { FarmOrderRow } from "@/server/queries/farmer";
import { ShipByBadge, shipUrgency } from "../ship-by";
import { itemsSummaryText } from "./items-summary";

export function OrdersTable({ rows, today, showShipBy }: { rows: FarmOrderRow[]; today: YMD; showShipBy: boolean }) {
  const columns: ColumnDef<FarmOrderRow, unknown>[] = [
    {
      id: "code",
      accessorFn: (r) => r.code,
      header: "注文番号",
      cell: ({ row: { original: r } }) => (
        <Link href={routes.farmer.order(r.id)} className="text-primary font-mono text-xs font-medium whitespace-nowrap hover:underline">
          {r.code}
        </Link>
      ),
    },
    { id: "date", accessorFn: (r) => new Date(r.createdAt).getTime(), header: "注文日時", cell: ({ row }) => <span className="text-xs whitespace-nowrap tabular-nums">{formatDateTime(row.original.createdAt)}</span> },
    {
      id: "customer",
      accessorFn: (r) => `${r.recipientName} ${r.prefecture}`,
      header: "お届け先",
      cell: ({ row: { original: r } }) => (
        <div className="min-w-28">
          <p className="flex items-center gap-1 font-medium">
            {r.recipientName} 様{r.hasGift && <Gift className="text-onion-red size-3.5" aria-label="ギフト" />}
          </p>
          <p className="text-muted-foreground text-xs">{r.prefecture}</p>
        </div>
      ),
    },
    {
      id: "items",
      accessorFn: (r) => r.items.map((i) => i.name).join(" "),
      header: "商品",
      enableSorting: false,
      cell: ({ row }) => <p className="line-clamp-2 max-w-64 text-xs">{itemsSummaryText(row.original.items)}</p>,
    },
    { id: "subtotal", accessorFn: (r) => r.subtotal, header: "小計", cell: ({ row }) => <span className="num whitespace-nowrap">{formatNumber(row.original.subtotal)}円</span> },
    ...(showShipBy
      ? [{ id: "shipBy", accessorFn: (r: FarmOrderRow) => r.shipByDate ?? "", header: "出荷期限", cell: ({ row }: { row: { original: FarmOrderRow } }) => <ShipByBadge shipByDate={row.original.shipByDate} today={today} /> } satisfies ColumnDef<FarmOrderRow, unknown>]
      : []),
    {
      id: "status",
      accessorFn: (r) => r.status,
      header: "状態",
      cell: ({ row: { original: r } }) => (
        <span className="inline-flex flex-wrap items-center gap-1">
          <StatusBadge kind="farmOrder" status={r.status} />
          {r.cancelRequested && <Badge variant="destructive">{orderCancelCopy.farmer.listBadge}</Badge>}
        </span>
      ),
    },
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      searchPlaceholder="注文番号・お名前・都道府県で検索"
      emptyText="該当する注文はありません"
      rowClassName={(r) => (showShipBy && shipUrgency(r.shipByDate, today) === "overdue" ? "bg-destructive/5" : undefined)}
    />
  );
}
