"use client";
import { Heart, HeartOff, ShoppingBasket } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { Price } from "@/components/common/price";
import { RatingSummary } from "@/components/common/rating";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/nav";
import { toggleFavorite } from "@/server/actions/engagement";
import type { FavoriteProduct } from "@/server/queries/account";
import { useCart } from "@/stores/cart";

export function FavoritesGrid({ products }: { products: FavoriteProduct[] }) {
  const router = useRouter();
  const add = useCart((s) => s.add);
  const [, start] = useTransition();
  const [visible, hide] = useOptimistic(products, (list, id: string) => list.filter((p) => p.id !== id));

  if (!visible.length) {
    return (
      <EmptyState icon={Heart} title="お気に入りはまだありません" description="商品ページのハートを押すと、ここに保存されます。" className="bg-card rounded-xl border">
        <Button asChild variant="outline" className="rounded-full">
          <Link href={routes.products}>商品をさがす</Link>
        </Button>
      </EmptyState>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 xl:grid-cols-4">
      {visible.map((p) => (
        <li key={p.id} className="group flex flex-col">
          <div className="bg-muted relative aspect-square overflow-hidden rounded-2xl">
            <Link href={routes.product(p.slug)} aria-label={p.name}>
              {p.imageUrl && (
                <Image
                  src={p.imageUrl}
                  alt={p.imageAlt}
                  fill
                  sizes="(min-width: 1280px) 20vw, (min-width: 768px) 30vw, 45vw"
                  className="object-cover transition-transform duration-700 motion-safe:group-hover:scale-[1.03]"
                />
              )}
            </Link>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              aria-label="お気に入りから外す"
              className="bg-background/85 absolute top-2 right-2 size-9 rounded-full backdrop-blur"
              onClick={() =>
                start(async () => {
                  hide(p.id);
                  const res = await toggleFavorite(p.id);
                  if (!res.ok) toast.error(res.error);
                  else toast.success("お気に入りから外しました");
                  router.refresh();
                })
              }
            >
              <HeartOff className="size-4" />
            </Button>
            {!p.purchasable && (
              <span className="bg-background/85 absolute bottom-2 left-2 rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur">
                {p.status === "active" ? "在庫切れ" : "販売休止中"}
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-1 flex-col gap-1">
            <p className="text-muted-foreground truncate text-xs">{p.farmName}</p>
            <Link href={routes.product(p.slug)} className="line-clamp-2 text-sm font-medium hover:underline">{p.name}</Link>
            <RatingSummary sum={p.ratingSum} count={p.ratingCount} />
            {p.variant && (
              <div className="flex items-baseline gap-2">
                <Price amount={p.variant.price} compareAt={p.variant.compareAtPrice} size="sm" />
                <span className="text-muted-foreground text-[11px]">{p.variant.label}</span>
              </div>
            )}
            <Button
              size="sm"
              variant={p.purchasable ? "default" : "outline"}
              className="mt-auto h-9 rounded-full"
              disabled={!p.purchasable}
              onClick={() => {
                if (!p.variant) return;
                add({
                  variantId: p.variant.id,
                  productId: p.id,
                  productSlug: p.slug,
                  productName: p.name,
                  variantLabel: p.variant.label,
                  farmId: p.farmId,
                  farmName: p.farmName,
                  imageUrl: p.imageUrl,
                  unitPrice: p.variant.price,
                  weightGrams: p.variant.weightGrams,
                  maxQuantity: Math.min(p.variant.stock, 99),
                });
                toast.success("カートに追加しました", { action: { label: "カートを見る", onClick: () => router.push(routes.cart) } });
              }}
            >
              <ShoppingBasket />カートに入れる
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
