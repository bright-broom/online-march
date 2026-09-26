import { Sprout } from "lucide-react";
import Link from "next/link";
import { RatingStars } from "@/components/common/rating";
import { ReviewPhotos } from "@/components/common/review-photos";
import { routes } from "@/config/nav";
import { formatDate } from "@/lib/format";
import type { ReviewDTO } from "@/server/queries/catalog";

/** レビュー1件。サーバー（ReviewsBlock）とクライアント（MoreReviews）の両方から使う */
export function ReviewItem({ review, showProduct = false }: { review: ReviewDTO; showProduct?: boolean }) {
  return (
    <article className="space-y-3 py-6 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <RatingStars value={review.rating} />
        {review.title && <h3 className="text-sm font-semibold">{review.title}</h3>}
      </div>
      <p className="text-foreground/85 text-sm leading-relaxed whitespace-pre-line">{review.body}</p>
      <ReviewPhotos images={review.images} alt={review.title || `${review.product.name}のレビュー`} />
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
