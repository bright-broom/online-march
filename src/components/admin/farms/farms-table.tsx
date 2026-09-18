"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { Star } from "lucide-react";
import Link from "next/link";
import { Price } from "@/components/common/price";
import { RatingSummary } from "@/components/common/rating";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/dashboard/data-table";
import { bpsToPercent } from "@/config/fees";
import { routes } from "@/config/nav";
import { formatDate } from "@/lib/format";
import type { AdminFarmRow } from "@/server/queries/admin";
import { FarmFeaturedSwitch } from "../toggles";
import { FarmRowActions } from "./farm-actions";

export function FarmsTable({ rows, platformBps }: { rows: AdminFarmRow[]; platformBps: number }) {
  const columns: ColumnDef<AdminFarmRow>[] = [
    {
      accessorKey: "name",
      header: "生産者",
      cell: ({ row: { original: f } }) => (
        <div className="min-w-44">
          <Link href={routes.admin.farm(f.id)} className="inline-flex items-center gap-1 font-medium hover:underline">
            {f.name}
            {f.isFeatured && <Star className="fill-primary text-primary size-3" aria-label="おすすめ" />}
          </Link>
          <p className="text-muted-foreground text-xs">{f.representative}</p>
        </div>
      ),
    },
    {
      accessorKey: "ownerEmail",
      header: "アカウント",
      cell: ({ row: { original: f } }) => (
        <div className="max-w-52">
          <p className="truncate text-sm">{f.ownerName}</p>
          <p className="text-muted-foreground truncate text-xs">{f.ownerEmail}</p>
        </div>
      ),
    },
    { accessorKey: "city", header: "所在地", cell: ({ getValue }) => <span className="text-xs whitespace-nowrap">{String(getValue())}</span> },
    { accessorKey: "products", header: "商品", cell: ({ getValue }) => <span className="num">{Number(getValue())}</span> },
    { accessorKey: "sales30d", header: "30日売上", cell: ({ getValue }) => <Price amount={Number(getValue())} size="sm" showTax={false} /> },
    {
      id: "rating",
      accessorFn: (f) => (f.ratingCount ? f.ratingSum / f.ratingCount : 0),
      header: "評価",
      cell: ({ row: { original: f } }) => <RatingSummary sum={f.ratingSum} count={f.ratingCount} />,
    },
    {
      id: "commission",
      accessorFn: (f) => f.commissionRateBps ?? platformBps,
      header: "手数料",
      cell: ({ row: { original: f } }) =>
        f.commissionRateBps == null ? (
          <span className="text-muted-foreground text-xs whitespace-nowrap">標準 {bpsToPercent(platformBps)}%</span>
        ) : (
          <span className="num text-primary font-semibold">{bpsToPercent(f.commissionRateBps)}%</span>
        ),
    },
    { accessorKey: "status", header: "状態", cell: ({ row: { original: f } }) => <StatusBadge kind="farm" status={f.status} /> },
    {
      id: "featured",
      header: "おすすめ",
      enableSorting: false,
      cell: ({ row: { original: f } }) => <FarmFeaturedSwitch farmId={f.id} featured={f.isFeatured} />,
    },
    {
      id: "date",
      accessorFn: (f) => (f.approvedAt ?? f.createdAt).valueOf(),
      header: "申請日 / 承認日",
      cell: ({ row: { original: f } }) => (
        <div className="text-xs whitespace-nowrap">
          <p>{formatDate(f.createdAt)}</p>
          <p className="text-muted-foreground">{f.approvedAt ? `承認 ${formatDate(f.approvedAt)}` : "未承認"}</p>
        </div>
      ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row: { original: f } }) => <FarmRowActions farm={f} platformBps={platformBps} />,
    },
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      searchPlaceholder="生産者名・メール・所在地で検索"
      emptyText="該当する生産者はいません"
    />
  );
}
