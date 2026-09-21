import { MessageSquareQuote, PenLine, Star } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { RatingStars } from "@/components/common/rating";
import { ToneBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { DeleteReviewButton } from "@/components/mypage/delete-review-button";
import { ReviewDialog } from "@/components/mypage/review-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { routes } from "@/config/nav";
import { formatDate } from "@/lib/format";
import { requireRole } from "@/server/auth/guards";
import { listMyReviews, listPendingReviews } from "@/server/queries/account";

export const metadata: Metadata = { title: "レビュー" };

export default async function ReviewsPage() {
  const user = await requireRole("customer", routes.mypage.reviews);
  const [pending, posted] = await Promise.all([listPendingReviews(user.id), listMyReviews(user.id)]);
  return (
    <>
      <PageHeader title="レビュー" description="感想は生産者さんの励みになり、次に選ぶ方の参考になります。" />
      <Tabs defaultValue={pending.length ? "pending" : "posted"} className="gap-4">
        <TabsList>
          <TabsTrigger value="pending" className="gap-1.5">レビュー待ち<span className="text-muted-foreground num text-[11px]">{pending.length}</span></TabsTrigger>
          <TabsTrigger value="posted" className="gap-1.5">投稿済み<span className="text-muted-foreground num text-[11px]">{posted.length}</span></TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          {/* 2列にするのは1枚が広く取れる幅から。中間幅で2列にすると商品名が1文字ずつ折り返す */}
          {pending.length ? (
            <ul className="grid gap-3 xl:grid-cols-2">
              {pending.map((r) => (
                <li key={`${r.farmOrderId}:${r.productId}`} className="bg-card flex flex-wrap items-center gap-4 rounded-xl border p-4">
                  <div className="bg-muted relative size-16 shrink-0 overflow-hidden rounded-lg">
                    {r.imageUrl && <Image src={r.imageUrl} alt={r.productName} fill sizes="64px" className="object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-muted-foreground truncate text-xs">{r.farmName}</p>
                    <Link href={routes.product(r.productSlug)} className="line-clamp-2 text-sm font-medium hover:underline">{r.productName}</Link>
                    <p className="text-muted-foreground text-xs">{r.variantLabel}・{formatDate(r.deliveredAt)} お届け</p>
                  </div>
                  <ReviewDialog productId={r.productId!} farmOrderId={r.farmOrderId} productName={r.productName} variantLabel={r.variantLabel} imageUrl={r.imageUrl} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={PenLine} title="レビュー待ちの商品はありません" description="お届けが完了した商品は、ここからレビューを書けます。" className="bg-card rounded-xl border" />
          )}
        </TabsContent>

        <TabsContent value="posted">
          {posted.length ? (
            <ul className="space-y-4">
              {posted.map((r) => (
                <li key={r.id} className="bg-card space-y-3 rounded-xl border p-5">
                  <div className="flex items-start gap-4">
                    <div className="bg-muted relative size-14 shrink-0 overflow-hidden rounded-lg">
                      {r.imageUrl && <Image src={r.imageUrl} alt={r.productName} fill sizes="56px" className="object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={routes.product(r.productSlug)} className="text-sm font-medium hover:underline">{r.productName}</Link>
                        {!r.isPublished && <ToneBadge tone="neutral">非公開</ToneBadge>}
                      </div>
                      <p className="text-muted-foreground text-xs">{r.farmName}・{formatDate(r.createdAt)}</p>
                      <RatingStars value={r.rating} />
                    </div>
                  </div>
                  {r.title && <p className="font-medium">{r.title}</p>}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{r.body}</p>
                  <div className="flex justify-end gap-1">
                    <ReviewDialog
                      productId={r.productId}
                      productName={r.productName}
                      imageUrl={r.imageUrl}
                      review={{ id: r.id, rating: r.rating, title: r.title, body: r.body }}
                    />
                    <DeleteReviewButton reviewId={r.id} productName={r.productName} />
                  </div>
                  {r.reply && (
                    <div className="bg-paper border-primary/40 space-y-1 rounded-r-lg border-l-2 p-3">
                      <p className="text-primary flex items-center gap-1.5 text-xs font-medium">
                        <MessageSquareQuote className="size-3.5" />{r.farmName}からの返信
                        {r.repliedAt && <span className="text-muted-foreground font-normal">・{formatDate(r.repliedAt)}</span>}
                      </p>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{r.reply}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Star} title="投稿したレビューはありません" className="bg-card rounded-xl border" />
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
