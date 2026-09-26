"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { MessageSquareReply } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { RatingStars } from "@/components/common/rating";
import { ReviewPhotos } from "@/components/common/review-photos";
import { DataTable } from "@/components/dashboard/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { routes } from "@/config/nav";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AdminReviewRow } from "@/server/queries/admin";
import { ReviewPublishSwitch } from "../toggles";

const filters = {
  all: "すべて",
  published: "公開中",
  hidden: "非公開",
  low: "★2以下",
  photos: "写真あり",
} as const;
type Filter = keyof typeof filters;

/** Review moderation (publish / unpublish via setReviewPublished → ratings recomputed). */
export function ReviewsTable({ rows }: { rows: AdminReviewRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const data = useMemo(
    () =>
      rows.filter((r) =>
        filter === "published" ? r.isPublished : filter === "hidden" ? !r.isPublished : filter === "low" ? r.rating <= 2 : filter === "photos" ? r.images.length > 0 : true,
      ),
    [rows, filter],
  );
  const columns: ColumnDef<AdminReviewRow>[] = [
    { accessorKey: "rating", header: "評価", cell: ({ row: { original: r } }) => <RatingStars value={r.rating} size={12} /> },
    {
      id: "content",
      accessorFn: (r) => `${r.title} ${r.body}`,
      header: "内容",
      enableSorting: false,
      cell: ({ row: { original: r } }) => (
        <div className={cn("max-w-md min-w-56 space-y-0.5", !r.isPublished && "opacity-60")}>
          {r.title && <p className="truncate font-medium">{r.title}</p>}
          <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">{r.body}</p>
          {/* 写真に問題があればレビューごと非公開にする（写真は商品ページから消える） */}
          <ReviewPhotos images={r.images} alt={`${r.productName}のレビュー`} size={48} className="pt-1" />
          {r.reply && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-primary inline-flex items-center gap-1 text-[11px]"><MessageSquareReply className="size-3" />生産者が返信済み</span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{r.reply}</TooltipContent>
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      id: "product",
      accessorFn: (r) => `${r.productName} ${r.farmName}`,
      header: "商品 / 生産者",
      cell: ({ row: { original: r } }) => (
        <div className="max-w-52">
          <Link href={routes.product(r.productSlug)} target="_blank" className="block truncate text-sm hover:underline">{r.productName}</Link>
          <p className="text-muted-foreground truncate text-xs">{r.farmName}</p>
        </div>
      ),
    },
    { accessorKey: "userName", header: "投稿者", cell: ({ getValue }) => <span className="text-xs">{String(getValue())}</span> },
    {
      id: "createdAt",
      accessorFn: (r) => r.createdAt.valueOf(),
      header: "投稿日",
      cell: ({ row: { original: r } }) => <span className="text-xs whitespace-nowrap">{formatDate(r.createdAt)}</span>,
    },
    {
      id: "published",
      header: "公開",
      enableSorting: false,
      cell: ({ row: { original: r } }) => <ReviewPublishSwitch reviewId={r.id} published={r.isPublished} />,
    },
  ];
  return (
    <DataTable
      columns={columns}
      data={data}
      getRowId={(r) => r.id}
      searchPlaceholder="レビュー本文・商品名で検索"
      emptyText="該当するレビューはありません"
      toolbar={
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger size="sm" className="w-32" aria-label="絞り込み"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(filters) as Filter[]).map((f) => (
              <SelectItem key={f} value={f}>{filters[f]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  );
}
