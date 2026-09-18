import { AlertTriangle, CheckCircle2, FileClock, MessageSquareWarning, TruckIcon } from "lucide-react";
import Link from "next/link";
import { PanelCard } from "@/components/admin/primitives";
import { ReviewPublishSwitch } from "@/components/admin/toggles";
import { RatingStars } from "@/components/common/rating";
import { StatusBadge, ToneBadge } from "@/components/common/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/nav";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format";
import type { AdminAttention } from "@/server/queries/admin";

function Empty({ text }: { text: string }) {
  return (
    <p className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
      <CheckCircle2 className="text-leaf size-4" />
      {text}
    </p>
  );
}

/** 要対応: pending applications, overdue shipments, failed jobs, low-rated reviews. */
export function AttentionPanel({ data, now }: { data: AdminAttention; now: Date }) {
  const total = data.pending.length + data.overdue.length + data.failedJobs.length + data.lowReviews.length;
  return (
    <section aria-labelledby="attention-heading" className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 id="attention-heading" className="heading-display text-lg">要対応</h2>
        {total > 0 ? <ToneBadge tone="warning">{total}件</ToneBadge> : <ToneBadge tone="success">なし</ToneBadge>}
      </div>
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <PanelCard
          title="出店申請"
          description="審査待ちの生産者"
          action={<FileClock className="text-muted-foreground size-4" />}
        >
          {data.pending.length ? (
            <ul className="divide-y">
              {data.pending.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={routes.admin.farm(f.id)} className="block truncate text-sm font-medium hover:underline">{f.name}</Link>
                    <p className="text-muted-foreground truncate text-xs">{f.representative}・{f.city}・{formatRelative(f.createdAt, now)}申請</p>
                  </div>
                  <Button asChild size="sm" variant="outline"><Link href={routes.admin.farm(f.id)}>審査</Link></Button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="審査待ちの申請はありません" />
          )}
        </PanelCard>

        <PanelCard title="配送遅延" description="出荷期限を過ぎた未発送" action={<TruckIcon className="text-muted-foreground size-4" />}>
          {data.overdue.length ? (
            <ul className="divide-y">
              {data.overdue.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={routes.admin.order(o.orderId)} className="num block truncate text-sm font-medium hover:underline">{o.code}</Link>
                    <p className="text-muted-foreground truncate text-xs">{o.farmName}・期限 {formatDate(o.shipByDate)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge kind="farmOrder" status={o.status} />
                    <span className="text-destructive text-[11px] font-semibold">{o.daysLate}日超過</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="遅延している出荷はありません" />
          )}
        </PanelCard>

        <PanelCard title="自動化ジョブの失敗" description="直近7日" action={<AlertTriangle className="text-muted-foreground size-4" />}>
          {data.failedJobs.length ? (
            <ul className="divide-y">
              {data.failedJobs.map((r) => (
                <li key={r.id} className="space-y-1 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{r.label}</span>
                    <span className="text-muted-foreground shrink-0 text-[11px]">{formatDateTime(r.startedAt)}</span>
                  </div>
                  <p className="text-destructive line-clamp-2 text-xs">{String(r.summary.error ?? "エラー")}</p>
                </li>
              ))}
              <li className="pt-2">
                <Button asChild variant="ghost" size="sm"><Link href={routes.admin.automation}>実行履歴を見る</Link></Button>
              </li>
            </ul>
          ) : (
            <Empty text="失敗したジョブはありません" />
          )}
        </PanelCard>

        <PanelCard title="要確認レビュー" description="直近14日の★2以下" action={<MessageSquareWarning className="text-muted-foreground size-4" />}>
          {data.lowReviews.length ? (
            <ul className="divide-y">
              {data.lowReviews.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <RatingStars value={r.rating} size={11} />
                      {!r.isPublished && <Badge variant="outline" className="text-[10px]">非公開</Badge>}
                    </div>
                    <p className="truncate text-sm">{r.title || r.body}</p>
                    <p className="text-muted-foreground truncate text-xs">{r.productName}・{r.farmName}</p>
                  </div>
                  <ReviewPublishSwitch reviewId={r.id} published={r.isPublished} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="確認が必要なレビューはありません" />
          )}
        </PanelCard>
      </div>
    </section>
  );
}
