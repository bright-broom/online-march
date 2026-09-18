"use client";
import { MapPin, MessageCircle, Tractor, UserMinus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { RatingSummary } from "@/components/common/rating";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/nav";
import { toggleFollow } from "@/server/actions/engagement";
import type { FollowedFarm } from "@/server/queries/account";

export function FollowedFarms({ farms }: { farms: FollowedFarm[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [visible, hide] = useOptimistic(farms, (list, id: string) => list.filter((f) => f.id !== id));
  if (!visible.length) {
    return (
      <EmptyState icon={Tractor} title="フォロー中の生産者はいません" description="生産者ページの「フォロー」で、新商品のお知らせが届きます。" className="bg-card rounded-xl border">
        <Button asChild variant="outline" className="rounded-full">
          <Link href={routes.farms}>生産者を見る</Link>
        </Button>
      </EmptyState>
    );
  }
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {visible.map((f) => (
        <li key={f.id} className="bg-card flex items-center gap-4 rounded-xl border p-4">
          <Avatar className="size-14">
            {f.avatarImage && <AvatarImage src={f.avatarImage} alt={f.name} />}
            <AvatarFallback className="bg-primary/15 text-primary font-serif text-lg">{f.name.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-0.5">
            <Link href={routes.farm(f.slug)} className="block truncate font-serif font-semibold hover:underline">{f.name}</Link>
            {f.tagline && <p className="text-muted-foreground line-clamp-1 text-xs">{f.tagline}</p>}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-muted-foreground inline-flex items-center gap-1 text-xs"><MapPin className="size-3" />{f.city}</span>
              <RatingSummary sum={f.ratingSum} count={f.ratingCount} />
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-1.5">
            <Button asChild size="icon-sm" variant="ghost" aria-label={`${f.name}にメッセージ`}>
              <Link href={`${routes.mypage.messages}?f=${f.id}`}><MessageCircle /></Link>
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`${f.name}のフォローを外す`}
              onClick={() =>
                start(async () => {
                  hide(f.id);
                  const res = await toggleFollow(f.id);
                  if (!res.ok) toast.error(res.error);
                  else toast.success("フォローを外しました");
                  router.refresh();
                })
              }
            >
              <UserMinus />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
