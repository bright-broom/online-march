"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { loadMoreProductReviews } from "@/server/actions/engagement";
import type { ReviewDTO } from "@/server/queries/catalog";
import { ReviewItem } from "./review-item";

/**
 * 商品レビューの「もっと見る」（#21）。最初の分はキャッシュされたページに入っていて、続きはここで読む。
 * 押すたびに次の分を足す。もう無ければボタンを消す。
 */
export function MoreReviews({ productId, offset }: { productId: string; offset: number }) {
  const [items, setItems] = useState<ReviewDTO[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [pending, start] = useTransition();
  const load = () =>
    start(async () => {
      const res = await loadMoreProductReviews({ productId, offset: offset + items.length });
      if (!res.ok) return void toast.error(res.error);
      setItems((prev) => [...prev, ...res.data.items]);
      setHasMore(res.data.hasMore);
    });
  return (
    <>
      {items.map((r) => (
        <ReviewItem key={r.id} review={r} showProduct={false} />
      ))}
      {hasMore && (
        <div className="pt-6">
          <Button type="button" variant="outline" className="rounded-full" onClick={load} disabled={pending}>
            {pending && <Spinner />}
            レビューをもっと見る
          </Button>
        </div>
      )}
    </>
  );
}
