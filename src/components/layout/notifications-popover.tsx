"use client";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { markAllNotificationsRead } from "@/server/actions/notifications";
import type { RecentNotification } from "@/server/queries/badges";

export function NotificationsPopover({ items, unread }: { items: RecentNotification[]; unread: number }) {
  const [pending, start] = useTransition();
  const [optimisticUnread, setUnread] = useOptimistic(unread);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`お知らせ ${optimisticUnread}件`}>
          <Bell className="size-4" />
          {optimisticUnread > 0 && (
            <span className="bg-destructive absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full text-[10px] font-bold text-white">
              {optimisticUnread > 9 ? "9+" : optimisticUnread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">お知らせ</p>
          <Button
            variant="ghost" size="sm" disabled={pending || optimisticUnread === 0}
            onClick={() => start(async () => { setUnread(0); await markAllNotificationsRead(); })}
          >
            <CheckCheck />すべて既読
          </Button>
        </div>
        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">お知らせはありません</p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id}>
                  <Link href={n.href ?? "#"} className={cn("hover:bg-muted/60 block px-4 py-3 transition-colors", !n.readAt && optimisticUnread > 0 && "bg-primary/5")}>
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.body && <p className="text-muted-foreground line-clamp-2 text-xs">{n.body}</p>}
                    <p className="text-muted-foreground mt-1 text-[11px]">{formatDateTime(n.createdAt)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
