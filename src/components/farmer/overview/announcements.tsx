import { Megaphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import type { getFarmerAnnouncements } from "@/server/queries/farmer";

type Announcement = Awaited<ReturnType<typeof getFarmerAnnouncements>>[number];

/** 運営からのお知らせ (audience all | farmer). Renders nothing when empty. */
export function FarmerAnnouncements({ items }: { items: Announcement[] }) {
  if (!items.length) return null;
  return (
    <Card className="border-sea/20 bg-sea/5 gap-3 py-4">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Megaphone className="text-sea size-4" aria-hidden />
          運営からのお知らせ
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5">
        <ul className="divide-sea/10 divide-y">
          {items.map((a) => (
            <li key={a.id} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-sm font-medium">{a.title}</p>
                <time className="text-muted-foreground text-xs" dateTime={a.publishedAt}>{formatDate(a.publishedAt)}</time>
              </div>
              {a.body && <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{a.body}</p>}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
