import { CalendarDays, Leaf, MapPin, UserRound } from "lucide-react";
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cultivationMethods, type CultivationKey } from "@/config/catalog";

export type FarmHeaderPreviewData = {
  name: string;
  tagline: string;
  representative: string;
  city: string;
  establishedYear: string;
  heroImage: string | null;
  avatarImage: string | null;
  cultivationMethods: string[];
};

/** Mirrors the public /farms/[slug] header so the farmer sees changes live. */
export function FarmHeaderPreview({ d }: { d: FarmHeaderPreviewData }) {
  return (
    <div className="bg-card overflow-hidden rounded-2xl border">
      <div className="bg-sea relative aspect-[16/7]">
        {d.heroImage && <Image src={d.heroImage} alt={`${d.name}の風景`} fill sizes="(min-width: 1024px) 640px, 100vw" className="object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-sea/85 via-sea/20 to-transparent" />
        <div className="text-sea-foreground absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
          <Avatar className="border-sea-foreground/80 size-14 border-2">
            {d.avatarImage && <AvatarImage src={d.avatarImage} alt={d.name} />}
            <AvatarFallback className="text-foreground">{d.name.slice(0, 1) || "農"}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="heading-display truncate text-xl">{d.name || "農園名"}</p>
            {d.tagline && <p className="line-clamp-1 text-xs opacity-90">{d.tagline}</p>}
          </div>
        </div>
      </div>
      <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-xs">
        {d.representative && <span className="inline-flex items-center gap-1"><UserRound className="size-3" />{d.representative}</span>}
        {d.city && <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{d.city}</span>}
        {d.establishedYear && <span className="inline-flex items-center gap-1"><CalendarDays className="size-3" />{d.establishedYear}年〜</span>}
      </div>
      {d.cultivationMethods.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-4">
          {d.cultivationMethods.map((k) => (
            <Badge key={k} variant="outline" className="text-leaf border-leaf/30 gap-1 rounded-full">
              <Leaf className="size-3" />{cultivationMethods[k as CultivationKey]?.label ?? k}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
