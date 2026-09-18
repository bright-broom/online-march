import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { RatingSummary } from "@/components/common/rating";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/nav";
import type { ProductDetailDTO } from "@/server/queries/catalog";
import { FarmAvatar } from "../farm-card";
import { FollowButton } from "../follow-button";

export function FarmMiniCard({ farm }: { farm: ProductDetailDTO["farm"] }) {
  return (
    <aside aria-label="生産者" className="bg-card rounded-2xl border p-4 sm:p-5">
      <div className="flex items-center gap-3.5">
        <FarmAvatar src={farm.avatarImage} name={farm.name} className="size-14 ring-0" />
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-[11px]">この商品の生産者</p>
          <Link href={routes.farm(farm.slug)} className="block truncate font-serif text-base font-semibold hover:underline">
            {farm.name}
          </Link>
          <RatingSummary sum={farm.ratingSum} count={farm.ratingCount} />
        </div>
      </div>
      {farm.tagline && <p className="text-muted-foreground mt-3 text-sm leading-relaxed">{farm.tagline}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <FollowButton farmId={farm.id} farmName={farm.name} size="sm" />
        <Button asChild variant="ghost" className="h-8 rounded-full px-3 text-xs">
          <Link href={`${routes.mypage.messages}?f=${farm.id}`}>
            <MessageCircle />
            農家さんに質問する
          </Link>
        </Button>
      </div>
    </aside>
  );
}
