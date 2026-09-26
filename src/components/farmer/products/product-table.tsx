"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, Copy, Eye, EyeOff, ImageOff, MoreHorizontal, Pencil, TriangleAlert, ExternalLink } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { RatingSummary } from "@/components/common/rating";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/dashboard/data-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { categories } from "@/config/catalog";
import { routes } from "@/config/nav";
import { formatNumber } from "@/lib/format";
import type { FarmProductRow } from "@/server/queries/farmer";
import { duplicateProduct, setProductStatus } from "@/server/actions/farmer-products";

function priceRange(r: FarmProductRow) {
  if (!r.variantCount) return "—";
  return r.minPrice === r.maxPrice ? `${formatNumber(r.minPrice)}円` : `${formatNumber(r.minPrice)}〜${formatNumber(r.maxPrice)}円`;
}

function RowActions({ row }: { row: FarmProductRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(res.message ?? "更新しました");
        after?.();
        router.refresh();
      } else toast.error(res.error);
    });
  const published = row.status === "active";
  return (
    <div className="flex items-center justify-end gap-2">
      {(row.status === "active" || row.status === "draft") && (
        <Switch
          checked={published}
          disabled={pending}
          onCheckedChange={(v) => run(() => setProductStatus({ id: row.id, status: v ? "active" : "draft" }))}
          aria-label={published ? "非公開にする" : "公開する"}
        />
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label="操作メニュー" disabled={pending}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem asChild>
            <Link href={routes.farmer.product(row.id)}><Pencil />編集</Link>
          </DropdownMenuItem>
          {row.status === "active" && (
            <DropdownMenuItem asChild>
              <Link href={routes.product(row.slug)} target="_blank"><ExternalLink />ストアで見る</Link>
            </DropdownMenuItem>
          )}
          {row.status === "active" ? (
            <DropdownMenuItem onSelect={() => run(() => setProductStatus({ id: row.id, status: "draft" }))}><EyeOff />非公開にする</DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => run(() => setProductStatus({ id: row.id, status: "active" }))}><Eye />公開する</DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() =>
              start(async () => {
                const res = await duplicateProduct(row.id);
                if (res.ok) {
                  toast.success(res.message);
                  router.push(routes.farmer.product(res.data.id));
                } else toast.error(res.error);
              })
            }
          >
            <Copy />複製
          </DropdownMenuItem>
          {row.status !== "archived" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => run(() => setProductStatus({ id: row.id, status: "archived" }))}>
                <Archive />アーカイブ
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const columns: ColumnDef<FarmProductRow, unknown>[] = [
  {
    id: "name",
    accessorFn: (r) => r.name,
    header: "商品",
    cell: ({ row: { original: r } }) => (
      <Link href={routes.farmer.product(r.id)} className="flex min-w-56 items-center gap-3">
        <span className="bg-muted relative size-12 shrink-0 overflow-hidden rounded-lg border">
          {r.image ? <Image src={r.image} alt={r.name} fill sizes="48px" className="object-cover" /> : <ImageOff className="text-muted-foreground absolute inset-0 m-auto size-4" />}
        </span>
        <span className="min-w-0">
          <span className="line-clamp-2 font-medium hover:underline">{r.name}</span>
          <span className="text-muted-foreground block text-xs">{categories[r.category].label}</span>
        </span>
      </Link>
    ),
  },
  { id: "status", accessorFn: (r) => r.status, header: "状態", cell: ({ row }) => <StatusBadge kind="product" status={row.original.status} /> },
  {
    id: "price",
    accessorFn: (r) => r.minPrice,
    header: "規格・価格",
    cell: ({ row: { original: r } }) => (
      <div className="text-xs whitespace-nowrap">
        <p className="num text-sm font-medium">{priceRange(r)}</p>
        <p className="text-muted-foreground">{r.variantCount}規格</p>
      </div>
    ),
  },
  {
    id: "stock",
    accessorFn: (r) => r.stock,
    header: "在庫",
    cell: ({ row: { original: r } }) => (
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <span className="num">{formatNumber(r.stock)}</span>
        {r.lowStock && r.status === "active" && (
          <span className="text-destructive inline-flex items-center gap-0.5 text-[11px] font-medium">
            <TriangleAlert className="size-3.5" />わずか
          </span>
        )}
      </span>
    ),
  },
  { id: "sold", accessorFn: (r) => r.soldCount, header: "販売数", cell: ({ row }) => <span className="num">{formatNumber(row.original.soldCount)}</span> },
  { id: "rating", accessorFn: (r) => (r.ratingCount ? r.ratingSum / r.ratingCount : 0), header: "評価", cell: ({ row }) => <RatingSummary sum={row.original.ratingSum} count={row.original.ratingCount} /> },
  { id: "actions", header: "", enableSorting: false, cell: ({ row }) => <RowActions row={row.original} /> },
];

export function ProductTable({ rows }: { rows: FarmProductRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      searchPlaceholder="商品名で検索"
      emptyText="該当する商品はありません"
      /* 「商品を登録」はページ見出しの横にある（ここにも置くと同じボタンが2つ並んでいた） */
      mobileCard={(r) => (
        <div className="flex items-center gap-3">
          <Link href={routes.farmer.product(r.id)} className="flex min-w-0 flex-1 items-center gap-3">
            <span className="bg-muted relative size-14 shrink-0 overflow-hidden rounded-lg border">
              {r.image ? <Image src={r.image} alt={r.name} fill sizes="56px" className="object-cover" /> : <ImageOff className="text-muted-foreground absolute inset-0 m-auto size-4" />}
            </span>
            <span className="min-w-0 space-y-1">
              <span className="line-clamp-2 text-sm font-medium">{r.name}</span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <StatusBadge kind="product" status={r.status} />
                <span className="num">{priceRange(r)}</span>
                <span className="text-muted-foreground inline-flex items-center gap-0.5">
                  在庫 <span className="num text-foreground">{formatNumber(r.stock)}</span>
                  {r.lowStock && r.status === "active" && <TriangleAlert className="text-destructive size-3.5" aria-label="在庫わずか" />}
                </span>
              </span>
            </span>
          </Link>
          <RowActions row={r} />
        </div>
      )}
    />
  );
}
