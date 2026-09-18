import { MessageSquareText, Sprout } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { RatingStars } from "@/components/common/rating";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/nav";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
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

export function ReviewItem({ review, showProduct = false }: { review: ReviewDTO; showProduct?: boolean }) {
  return (
    <article className="space-y-3 py-6 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <RatingStars value={review.rating} />
        {review.title && <h3 className="text-sm font-semibold">{review.title}</h3>}
      </div>
      <p className="text-foreground/85 text-sm leading-relaxed whitespace-pre-line">{review.body}</p>
      <p className="text-muted-foreground text-xs">
        {review.author}・<time dateTime={review.createdAt}>{formatDate(review.createdAt)}</time>
        {showProduct && (
          <>
            ・
            <Link href={routes.product(review.product.slug)} className="hover:text-primary underline-offset-4 hover:underline">
              {review.product.name}
            </Link>
          </>
        )}
      </p>
      {review.reply && (
        <div className="border-primary/40 bg-paper/70 ml-1 rounded-r-xl border-l-2 py-3 pr-4 pl-4">
          <p className="text-primary flex items-center gap-1.5 text-xs font-semibold">
            <Sprout className="size-3.5" />
            {review.farm.name}からの返信
          </p>
          <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed whitespace-pre-line">{review.reply}</p>
        </div>
      )}
    </article>
  );
}

export function ReviewsBlock({
  summary,
  items,
  showProduct = false,
  emptyText,
}: {
  summary: ReviewSummaryDTO;
  items: ReviewDTO[];
  showProduct?: boolean;
  emptyText: string;
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
