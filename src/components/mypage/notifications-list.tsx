"use client";
import { Bell, CheckCheck, ChevronRight, Megaphone, MessageCircle, Package, Sprout, Star, Truck, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import type { NotificationType } from "@/db/schema";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { markAllNotificationsRead, markNotificationRead } from "@/server/actions/notifications";
import type { RecentNotification } from "@/server/queries/badges";

const typeIcon: Record<NotificationType, LucideIcon> = {
  order: Package,
  shipping: Truck,
  review: Star,
  payout: Wallet,
  message: MessageCircle,
  product: Sprout,
  system: Megaphone,
};

export function NotificationsList({ items }: { items: RecentNotification[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [list, apply] = useOptimistic(items, (l, id: string | "all") =>
    l.map((n) => (id === "all" || n.id === id ? { ...n, readAt: n.readAt ?? new Date() } : n)),
  );
  const unread = list.filter((n) => !n.readAt).length;

  if (!list.length) return <EmptyState icon={Bell} title="お知らせはありません" className="bg-card rounded-xl border" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">未読 <span className="num text-foreground font-semibold">{unread}</span> 件</p>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          disabled={pending || unread === 0}
          onClick={() =>
            start(async () => {
              apply("all");
              const res = await markAllNotificationsRead();
              if (!res.ok) toast.error(res.error);
              router.refresh();
            })
          }
        >
          <CheckCheck />すべて既読にする
        </Button>
      </div>
      <ul className="bg-card divide-y overflow-hidden rounded-xl border">
        {list.map((n) => {
          const I = typeIcon[n.type] ?? Bell;
          const content = (
            <>
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", n.readAt ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}>
                <I className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm", !n.readAt && "font-semibold")}>{n.title}</p>
                {n.body && <p className="text-muted-foreground line-clamp-2 text-xs">{n.body}</p>}
                <p className="text-muted-foreground num mt-0.5 text-[11px]">{formatDateTime(n.createdAt)}</p>
              </div>
              {!n.readAt && <span className="bg-primary size-2 shrink-0 rounded-full" aria-label="未読" />}
              {n.href && <ChevronRight className="text-muted-foreground size-4 shrink-0" />}
            </>
          );
          const markRead = () => {
            if (n.readAt) return;
            start(async () => {
              apply(n.id);
              await markNotificationRead(n.id);
            });
          };
          return (
            <li key={n.id}>
              {n.href ? (
                <Link href={n.href} onClick={markRead} className="hover:bg-muted/50 flex items-center gap-3 px-4 py-3 transition-colors">
                  {content}
                </Link>
              ) : (
                <button type="button" onClick={markRead} className="hover:bg-muted/50 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors">
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
