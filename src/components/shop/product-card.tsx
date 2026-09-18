import Image from "next/image";
import Link from "next/link";
import { Price } from "@/components/common/price";
import { RatingSummary } from "@/components/common/rating";
import { Skeleton } from "@/components/ui/skeleton";
import { categories } from "@/config/catalog";
import { images } from "@/config/images";
import { routes } from "@/config/nav";
import { cn } from "@/lib/utils";
import type { ProductCardDTO } from "@/server/queries/catalog";
import { FavoriteButton } from "./favorite-button";

export const productGridClass = "grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4";
const cardSizes = "(min-width: 1024px) 22vw, (min-width: 768px) 30vw, 46vw";

function CardBadges({ p }: { p: ProductCardDTO }) {
  const badges: { label: string; className: string }[] = [];
  if (p.soldOut) badges.push({ label: "売り切れ", className: "bg-foreground/80 text-background" });
  else if (p.lowStock) badges.push({ label: "残りわずか", className: "bg-primary text-primary-foreground" });
  if (p.isNew) badges.push({ label: "新着", className: "bg-leaf text-primary-foreground" });
  if (p.compareAt) badges.push({ label: "SALE", className: "bg-onion-red text-primary-foreground font-display tracking-wider" });
  if (!badges.length) return null;
  return (
    <div className="pointer-events-none absolute top-2.5 left-2.5 flex flex-col items-start gap-1">
      {badges.map((b) => (
        <span key={b.label} className={cn("rounded-full px-2.5 py-0.5 text-[10px] leading-5 font-semibold shadow-sm", b.className)}>
          {b.label}
        </span>
      ))}
    </div>
  );
}

export function ProductCard({ product: p, priority = false }: { product: ProductCardDTO; priority?: boolean }) {
  const [first, second] = p.images;
  const href = routes.product(p.slug);
  return (
    <article className="group/card relative flex flex-col">
      <div className="bg-muted relative aspect-[4/5] overflow-hidden rounded-2xl">
        <Link href={href} className="absolute inset-0" aria-label={p.name} tabIndex={-1}>
          <Image
            src={first?.url ?? images.onionGolden}
            alt={first?.alt || p.name}
            fill
            sizes={cardSizes}
            priority={priority}
            className={cn(
              "object-cover transition-all duration-700 ease-out group-hover/card:scale-[1.03]",
              second && "group-hover/card:opacity-0",
              p.soldOut && "grayscale-[35%]",
            )}
          />
          {second && (
            <Image
              src={second.url}
              alt=""
              aria-hidden
              fill
              sizes={cardSizes}
              className="object-cover opacity-0 transition-all duration-700 ease-out group-hover/card:scale-[1.03] group-hover/card:opacity-100"
            />
          )}
        </Link>
        <CardBadges p={p} />
        <FavoriteButton productId={p.id} productName={p.name} className="absolute top-2 right-2" />
      </div>

      <div className="mt-3 flex flex-1 flex-col gap-1.5">
        <p className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[11px]">
          <span className="border-border shrink-0 rounded-full border px-2 py-px">{categories[p.category]?.label ?? p.category}</span>
          {p.variety && <span className="truncate">{p.variety}</span>}
        </p>
        <h3 className="line-clamp-2 text-sm leading-snug font-medium sm:text-[15px]">
          <Link href={href} className="after:absolute after:inset-x-0 after:bottom-0 after:h-24 hover:underline hover:decoration-primary/40 hover:underline-offset-4 focus-visible:underline">
            {p.name}
          </Link>
        </h3>
        <Link href={routes.farm(p.farm.slug)} className="text-muted-foreground hover:text-primary relative z-10 w-fit truncate text-xs transition-colors">
          {p.farm.name}
        </Link>
        <div className="mt-auto flex flex-col gap-1 pt-1">
          <span className="flex items-baseline gap-1">
            <Price amount={p.minPrice} compareAt={p.compareAt} size="md" showTax={false} />
            {p.variantCount > 1 && <span className="text-muted-foreground text-[11px]">〜</span>}
          </span>
          <RatingSummary sum={p.ratingSum} count={p.ratingCount} />
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({
  products,
  priorityCount = 0,
  className,
}: {
  products: ProductCardDTO[];
  priorityCount?: number;
  className?: string;
}) {
  return (
    <div className={cn(productGridClass, className)}>
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} priority={i < priorityCount} />
      ))}
    </div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col">
      <Skeleton className="aspect-[4/5] w-full rounded-2xl" />
      <Skeleton className="mt-3 h-3 w-1/3" />
      <Skeleton className="mt-2 h-4 w-full" />
      <Skeleton className="mt-1.5 h-4 w-2/3" />
      <Skeleton className="mt-3 h-5 w-1/2" />
    </div>
  );
}

export function ProductGridSkeleton({ count = 8, className }: { count?: number; className?: string }) {
  return (
    <div className={cn(productGridClass, className)}>
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
