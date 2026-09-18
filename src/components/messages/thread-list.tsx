import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ThreadListItem = {
  key: string;
  href: string;
  name: string;
  avatar?: string | null;
  preview: string;
  lastAt: Date | string | null;
  unread: number;
};

/** Conversation list (left pane). Pure/presentational — works in server and client trees. */
export function ThreadList({ items, activeKey, emptyText = "まだメッセージはありません" }: { items: ThreadListItem[]; activeKey?: string | null; emptyText?: string }) {
  if (!items.length) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm">
        <MessageCircle className="size-6" />
        {emptyText}
      </div>
    );
  }
  return (
    <ul className="divide-y">
      {items.map((t) => {
        const active = t.key === activeKey;
        return (
          <li key={t.key}>
            <Link
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn("hover:bg-muted/60 flex items-center gap-3 px-4 py-3 transition-colors", active && "bg-primary/8 hover:bg-primary/10")}
            >
              <Avatar className="size-10">
                {t.avatar && <AvatarImage src={t.avatar} alt={t.name} />}
                <AvatarFallback className="bg-primary/15 text-primary font-serif">{t.name.slice(0, 1)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn("truncate text-sm", t.unread > 0 ? "font-semibold" : "font-medium")}>{t.name}</p>
                  {t.lastAt && <span className="text-muted-foreground shrink-0 text-[11px]">{formatShortDate(t.lastAt)}</span>}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-muted-foreground truncate text-xs">{t.preview || "新しい会話"}</p>
                  {t.unread > 0 && <Badge className="h-5 min-w-5 shrink-0 rounded-full px-1.5 text-[10px]">{t.unread}</Badge>}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
