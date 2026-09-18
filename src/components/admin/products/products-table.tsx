"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, ArchiveRestore, ExternalLink, ImageOff } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { RatingSummary } from "@/components/common/rating";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/dashboard/data-table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { categories, categoryKeys } from "@/config/catalog";
import { routes } from "@/config/nav";
import { farmStatusMeta, productStatusMeta } from "@/config/status";
import type { ProductStatus } from "@/db/schema/marketplace";
import { formatYen } from "@/lib/format";
import { cn } from "@/lib/utils";
import { setProductArchived } from "@/server/actions/admin-catalog";
import type { AdminProductRow } from "@/server/queries/admin";
import { ConfirmAction } from "../confirm-action";
import { ProductFeaturedSwitch } from "../toggles";

const ALL = "all";

export function ProductsTable({ rows }: { rows: AdminProductRow[] }) {
  const [status, setStatus] = useState<string>(ALL);
  const [category, setCategory] = useState<string>(ALL);
  const [farm, setFarm] = useState<string>(ALL);
  const farms = useMemo(() => [...new Map(rows.map((r) => [r.farmId, r.farmName])).entries()].sort((a, b) => a[1].localeCompare(b[1], "ja")), [rows]);
  const data = useMemo(
    () =>
      rows.filter(
        (r) => (status === ALL || r.status === status) && (category === ALL || r.category === category) && (farm === ALL || r.farmId === farm),
      ),
    [rows, status, category, farm],
  );

  const columns: ColumnDef<AdminProductRow>[] = [
    {
      id: "image",
      header: "",
      enableSorting: false,
      cell: ({ row: { original: p } }) => (
        <div className="bg-muted relative size-11 overflow-hidden rounded-lg">
          {p.image ? (
            <Image src={p.image} alt={p.name} fill sizes="44px" className="object-cover" />
          ) : (
            <ImageOff className="text-muted-foreground absolute inset-0 m-auto size-4" />
          )}
        </div>
      ),
    },
    {
      id: "name",
      accessorFn: (p) => `${p.name} ${p.farmName}`,
      header: "商品",
      cell: ({ row: { original: p } }) => (
        <div className="max-w-64 min-w-40">
          <p className="truncate font-medium">{p.name}</p>
          <Link href={routes.admin.farm(p.farmId)} className="text-muted-foreground truncate text-xs hover:underline">
            {p.farmName}
            {p.farmStatus !== "active" && <span className="text-destructive ml-1">（生産者{farmStatusMeta[p.farmStatus].label}）</span>}
          </Link>
        </div>
      ),
    },
    { accessorKey: "category", header: "カテゴリ", cell: ({ row: { original: p } }) => <span className="text-xs whitespace-nowrap">{categories[p.category].label}</span> },
    {
      id: "price",
      accessorFn: (p) => p.minPrice ?? 0,
      header: "価格",
      cell: ({ row: { original: p } }) => (
        <span className="num text-xs whitespace-nowrap">
          {p.minPrice == null ? "—" : p.minPrice === p.maxPrice ? formatYen(p.minPrice) : `${formatYen(p.minPrice)}〜${formatYen(p.maxPrice ?? p.minPrice)}`}
        </span>
      ),
    },
    {
      accessorKey: "stock",
      header: "在庫",
      cell: ({ row: { original: p } }) => <span className={cn("num", p.stock === 0 && "text-destructive font-semibold")}>{p.stock}</span>,
    },
    { accessorKey: "soldCount", header: "販売数", cell: ({ getValue }) => <span className="num">{Number(getValue())}</span> },
    {
      id: "rating",
      accessorFn: (p) => (p.ratingCount ? p.ratingSum / p.ratingCount : 0),
      header: "評価",
      cell: ({ row: { original: p } }) => <RatingSummary sum={p.ratingSum} count={p.ratingCount} />,
    },
    { accessorKey: "status", header: "状態", cell: ({ row: { original: p } }) => <StatusBadge kind="product" status={p.status} /> },
    {
      id: "featured",
      header: "特集",
      enableSorting: false,
      cell: ({ row: { original: p } }) => <ProductFeaturedSwitch productId={p.id} featured={p.isFeatured} />,
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row: { original: p } }) => (
        <div className="flex items-center justify-end gap-1">
          {p.status !== "archived" && p.status !== "draft" && (
            <Button asChild variant="ghost" size="icon" aria-label="ストアで見る">
              <Link href={routes.product(p.slug)} target="_blank"><ExternalLink /></Link>
            </Button>
          )}
          {p.status === "archived" ? (
            <ConfirmAction
              trigger={<Button variant="ghost" size="icon" aria-label="復元"><ArchiveRestore /></Button>}
              title="商品を復元しますか？"
              description={`「${p.name}」を在庫に応じて「販売中」または「売り切れ」に戻します。`}
              confirmLabel="復元する"
              action={() => setProductArchived({ productId: p.id, archived: false })}
            />
          ) : (
            <ConfirmAction
              trigger={<Button variant="ghost" size="icon" aria-label="アーカイブ"><Archive /></Button>}
              title="商品をアーカイブしますか？"
              description={`「${p.name}」をストアから非表示にし、特集からも外します。生産者の商品管理には残ります。`}
              confirmLabel="アーカイブする"
              destructive
              action={() => setProductArchived({ productId: p.id, archived: true })}
            />
          )}
        </div>
      ),
    },
  ];

  const filters = (
    <>
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger size="sm" className="w-32" aria-label="状態"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>すべての状態</SelectItem>
          {(Object.keys(productStatusMeta) as ProductStatus[]).map((s) => (
            <SelectItem key={s} value={s}>{productStatusMeta[s].label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger size="sm" className="w-40" aria-label="カテゴリ"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>すべてのカテゴリ</SelectItem>
          {categoryKeys.map((c) => (
            <SelectItem key={c} value={c}>{categories[c].label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={farm} onValueChange={setFarm}>
        <SelectTrigger size="sm" className="w-44" aria-label="生産者"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>すべての生産者</SelectItem>
          {farms.map(([id, name]) => (
            <SelectItem key={id} value={id}>{name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      getRowId={(r) => r.id}
      toolbar={filters}
      searchPlaceholder="商品名・生産者で検索"
      emptyText="条件に合う商品はありません"
    />
  );
}
