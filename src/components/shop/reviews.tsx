import { MessageSquareText } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { RatingStars } from "@/components/common/rating";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { MoreReviews } from "./more-reviews";
import { ReviewItem } from "./review-item";

export { ReviewItem };
import type { ReviewDTO, ReviewSummaryDTO } from "@/server/queries/catalog";

export function ReviewSummaryPanel({ summary, className }: { summary: ReviewSummaryDTO; className?: string }) {
  const max = Math.max(1, ...summary.distribution);
  return (
    <div className={cn("bg-paper rounded-2xl p-6", className)}>
      <div className="flex items-end gap-3">
        <span className="font-display text-5xl leading-none font-medium">{summary.count ? summary.average.toFixed(1) : "—"}</span>
        <div className="space-y-1 pb-1">
          <RatingStars value={summary.average} size={16} />
          <p className="text-muted-foreground text-xs">
            <span className="num">{summary.count}</span>件のレビュー
          </p>
        </div>
      </div>
      <ul className="mt-5 space-y-1.5" aria-label="評価の分布">
        {[5, 4, 3, 2, 1].map((star) => {
          const n = summary.distribution[star - 1];
          return (
            <li key={star} className="flex items-center gap-2.5 text-xs">
              <span className="num text-muted-foreground w-5 shrink-0">★{star}</span>
              <span className="bg-background h-2 flex-1 overflow-hidden rounded-full">
                <span className="bg-chart-1 block h-full rounded-full" style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="num text-muted-foreground w-6 shrink-0 text-right">{n}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ReviewsBlock({
  summary,
  items,
  showProduct = false,
  emptyText,
  more,
}: {
  summary: ReviewSummaryDTO;
  items: ReviewDTO[];
  showProduct?: boolean;
  emptyText: string;
  /** 商品ページだけ: 最初の分で打ち切っていれば「もっと見る」を出す（#21） */
  more?: { productId: string; pageSize: number };
}) {
  if (!items.length) {
    return <EmptyState icon={MessageSquareText} title="まだレビューはありません" description={emptyText} className="bg-paper/60 border py-12" />;
  }
  return (
    <div className="grid gap-8 lg:grid-cols-[18rem_1fr] lg:gap-12">
      <ReviewSummaryPanel summary={summary} className="lg:sticky lg:top-24 lg:self-start" />
      <div className="divide-y">
        {items.map((r) => (
          <ReviewItem key={r.id} review={r} showProduct={showProduct} />
        ))}
        {more && items.length >= more.pageSize && <MoreReviews productId={more.productId} offset={items.length} />}
      </div>
    </div>
  );
}

export function ReviewsSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[18rem_1fr] lg:gap-12">
      <Skeleton className="h-56 rounded-2xl" />
      <div className="space-y-6">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
