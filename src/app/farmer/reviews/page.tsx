import { Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { RatingStars } from "@/components/common/rating";
import { ReviewPhotos } from "@/components/common/review-photos";
import { ToneBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { LinkTabs } from "@/components/farmer/link-tabs";
import { ReviewReplyForm } from "@/components/farmer/reviews/review-reply-form";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { routes } from "@/config/nav";
import { formatDate } from "@/lib/format";
import { requireFarm } from "@/server/auth/guards";
import { getFarmReviews, getFarmReviewStats } from "@/server/queries/farmer";

export const metadata: Metadata = { title: "レビュー" };

export default async function FarmerReviewsPage({ searchParams }: PageProps<"/farmer/reviews">) {
  const { farm } = await requireFarm("catalog");
  const sp = await searchParams;
  const unrepliedOnly = sp.filter === "unreplied";
  const [stats, reviews] = await Promise.all([getFarmReviewStats(farm.id), getFarmReviews(farm.id, { unrepliedOnly })]);

  return (
    <div>
      <PageHeader title="レビュー" description="お客さまの声に返信すると、次のお客さまの安心につながります。" />

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="lg:sticky lg:top-20 lg:self-start">
          <CardContent className="space-y-5">
            <div className="text-center">
              <p className="num text-5xl font-semibold">{stats.total ? stats.average.toFixed(1) : "—"}</p>
              <RatingStars value={stats.average} size={18} className="mt-2" />
              <p className="text-muted-foreground mt-1 text-xs">{stats.total}件のレビュー</p>
            </div>
            <ul className="space-y-2">
              {stats.distribution.map((d) => (
                <li key={d.star} className="flex items-center gap-2 text-xs">
                  <span className="flex w-8 items-center gap-0.5 tabular-nums">{d.star}<Star className="fill-primary text-primary size-3" /></span>
                  <Progress value={stats.total ? (d.count / stats.total) * 100 : 0} className="h-2 flex-1" />
                  <span className="text-muted-foreground w-8 text-right tabular-nums">{d.count}</span>
                </li>
              ))}
            </ul>
            {stats.unreplied > 0 && (
              <p className="bg-primary/10 text-primary rounded-lg p-3 text-center text-xs font-medium">
                未返信のレビューが<span className="num">{stats.unreplied}</span>件あります
              </p>
            )}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-4">
          <LinkTabs
            active={unrepliedOnly ? "unreplied" : "all"}
            tabs={[
              { key: "all", label: "すべて", href: routes.farmer.reviews, count: stats.total },
              { key: "unreplied", label: "未返信", href: `${routes.farmer.reviews}?filter=unreplied`, count: stats.unreplied, highlight: true },
            ]}
          />
          {reviews.length ? (
            <ul className="space-y-4">
              {reviews.map((r) => (
                <li key={r.id}>
                  <Card>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <RatingStars value={r.rating} size={15} />
                          {!r.isPublished && <ToneBadge tone="neutral">非公開</ToneBadge>}
                        </div>
                        <span className="text-muted-foreground text-xs">{formatDate(r.createdAt)}</span>
                      </div>
                      {r.title && <p className="font-medium">{r.title}</p>}
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{r.body}</p>
                      <ReviewPhotos images={r.images} alt={`${r.productName}のレビュー`} size={64} />
                      <p className="text-muted-foreground text-xs">
                        {r.customerName} さん・
                        <Link href={routes.product(r.productSlug)} className="hover:text-foreground underline-offset-2 hover:underline" target="_blank">{r.productName}</Link>
                      </p>
                      <ReviewReplyForm reviewId={r.id} initial={r.reply} customerName={r.customerName} />
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Star}
              title={unrepliedOnly ? "未返信のレビューはありません" : "まだレビューはありません"}
              description={unrepliedOnly ? "すべてのレビューに返信済みです。" : "お届けの3日後に、お客さまへレビュー依頼が自動で送られます。"}
            />
          )}
        </div>
      </div>
    </div>
  );
}
