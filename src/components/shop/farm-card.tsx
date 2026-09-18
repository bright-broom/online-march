import { MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { RatingSummary } from "@/components/common/rating";
import { Skeleton } from "@/components/ui/skeleton";
import { cultivationMethods, type CultivationKey } from "@/config/catalog";
import { images } from "@/config/images";
import { routes } from "@/config/nav";
import { cn } from "@/lib/utils";
import type { FarmCardDTO } from "@/server/queries/catalog";

export function CultivationBadge({ method, className }: { method: string; className?: string }) {
  const meta = cultivationMethods[method as CultivationKey];
  if (!meta) return null;
  return (
    <span
      title={meta.description}
      className={cn("border-leaf/30 bg-leaf/10 text-leaf inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium", className)}
    >
      {meta.label}
    </span>
  );
}

export function FarmAvatar({ src, name, className }: { src: string | null; name: string; className?: string }) {
  return (
    <span className={cn("bg-paper ring-background relative block size-14 shrink-0 overflow-hidden rounded-full ring-4", className)}>
      {src ? (
        <Image src={src} alt={`${name}のアイコン`} fill sizes="96px" className="object-cover" />
      ) : (
        <span className="text-primary flex size-full items-center justify-center font-serif text-lg">{name.slice(0, 1)}</span>
      )}
    </span>
  );
}

export function FarmCard({ farm, className }: { farm: FarmCardDTO; className?: string }) {
  return (
    <article className={cn("group/farm bg-card relative flex flex-col overflow-hidden rounded-2xl border transition-shadow hover:shadow-sm", className)}>
      <div className="bg-muted relative aspect-[16/10] overflow-hidden">
        <Image
          src={farm.heroImage ?? images.fieldRows}
          alt=""
          fill
          sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw"
          className="object-cover transition-transform duration-700 ease-out group-hover/farm:scale-[1.03]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
      </div>
      <div className="relative flex flex-1 flex-col gap-3 px-5 pb-5">
        <FarmAvatar src={farm.avatarImage} name={farm.name} className="-mt-7" />
        <div className="space-y-1">
          <h3 className="heading-display text-lg">
            <Link href={routes.farm(farm.slug)} className="after:absolute after:inset-0 focus-visible:underline">
              {farm.name}
            </Link>
          </h3>
          <p className="text-muted-foreground line-clamp-2 text-sm leading-relaxed">{farm.tagline}</p>
        </div>
        {farm.cultivationMethods.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {farm.cultivationMethods.slice(0, 3).map((m) => (
              <CultivationBadge key={m} method={m} />
            ))}
          </div>
        )}
        <div className="text-muted-foreground mt-auto flex items-center justify-between gap-3 border-t pt-3 text-xs">
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{farm.city}</span>
          </span>
          <span className="flex shrink-0 items-center gap-3">
            <RatingSummary sum={farm.ratingSum} count={farm.ratingCount} />
            <span className="num">{farm.productCount}品</span>
          </span>
        </div>
      </div>
    </article>
  );
}

export function FarmCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border">
      <Skeleton className="aspect-[16/10] w-full rounded-none" />
      <div className="space-y-3 px-5 pb-5">
        <Skeleton className="-mt-7 size-14 rounded-full" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}
