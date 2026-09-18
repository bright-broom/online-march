import { ArrowRight, MessageSquareReply, PackageCheck, Star } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { RatingStars } from "@/components/common/rating";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { routes } from "@/config/nav";
import type { YMD } from "@/lib/dates";
import { formatRelative } from "@/lib/format";
import type { getLatestReviews, getUpcomingShipments } from "@/server/queries/farmer";
import { ShipByBadge } from "../ship-by";

export function UpcomingShipments({ rows, today }: { rows: Awaited<ReturnType<typeof getUpcomingShipments>>; today: YMD }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>これから出荷する注文</CardTitle>
        <CardDescription>出荷期限の近い順</CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link href={routes.farmer.shipping}>出荷センター<ArrowRight /></Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={routes.farmer.order(r.id)} className="hover:bg-muted/50 -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.recipientName} 様<span className="text-muted-foreground ml-2 text-xs">{r.prefecture}</span></p>
                    <p className="text-muted-foreground font-mono text-[11px]">{r.code}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <ShipByBadge shipByDate={r.shipByDate} today={today} />
                    <StatusBadge kind="farmOrder" status={r.status} className="text-[10px]" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={PackageCheck} title="出荷待ちの注文はありません" description="新しい注文が入ると、ここに表示されます。" className="py-6" />
        )}
      </CardContent>
    </Card>
  );
}

export function LatestReviews({ rows, now }: { rows: Awaited<ReturnType<typeof getLatestReviews>>; now: Date }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>最新のレビュー</CardTitle>
        <CardDescription>お客さまの声にひとこと返信しましょう</CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link href={routes.farmer.reviews}>すべて見る<ArrowRight /></Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <ul className="space-y-4">
            {rows.map((r) => (
              <li key={r.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <RatingStars value={r.rating} size={13} />
                  <span className="text-muted-foreground text-[11px]">{formatRelative(r.createdAt, now)}</span>
                </div>
                <p className="line-clamp-2 text-sm leading-relaxed">{r.title ? <span className="font-medium">{r.title}　</span> : null}{r.body}</p>
                <div className="text-muted-foreground flex items-center justify-between text-[11px]">
                  <span className="truncate">{r.customerName} さん・{r.productName}</span>
                  {!r.reply && (
                    <Link href={`${routes.farmer.reviews}?filter=unreplied`} className="text-primary inline-flex shrink-0 items-center gap-1 font-medium">
                      <MessageSquareReply className="size-3" />返信する
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Star} title="まだレビューはありません" description="お届け後にお客さまへレビュー依頼が自動で送られます。" className="py-6" />
        )}
      </CardContent>
    </Card>
  );
}
