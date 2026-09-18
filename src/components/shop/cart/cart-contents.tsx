"use client";
import { ArrowRight, CalendarCheck, ShoppingBasket, Tractor, Trash2, Truck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { Price } from "@/components/common/price";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/nav";
import { carriers } from "@/config/shipping";
import { useHydrated } from "@/hooks/use-hydrated";
import { fromYmd } from "@/lib/dates";
import { formatShortDate, formatWeight, formatYenJa } from "@/lib/format";
import { cn } from "@/lib/utils";
import { cartCount, cartSubtotal, groupByFarm, useCart, useShippingPrefs, type CartItem } from "@/stores/cart";
import { estimateFarmGroup, useTodayYmd, type FarmEstimate } from "./estimate";
import { PrefectureSelect } from "./prefecture-select";
import { QuantityStepper } from "./quantity-stepper";

type Variant = "sheet" | "page";

function LineItem({ item, onNavigate, variant }: { item: CartItem; onNavigate?: () => void; variant: Variant }) {
  const setQuantity = useCart((s) => s.setQuantity);
  const remove = useCart((s) => s.remove);
  const href = routes.product(item.productSlug);
  return (
    <li className="flex gap-3.5 py-4 sm:gap-4">
      <Link
        href={href}
        onClick={onNavigate}
        className={cn("bg-muted relative shrink-0 overflow-hidden rounded-xl", variant === "page" ? "size-24 sm:size-28" : "size-20")}
      >
        {item.imageUrl && <Image src={item.imageUrl} alt={item.productName} fill sizes="112px" className="object-cover" />}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <Link href={href} onClick={onNavigate} className="line-clamp-2 text-sm leading-snug font-medium hover:underline">
            {item.productName}
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive -mt-1 -mr-1 shrink-0"
            onClick={() => remove(item.variantId)}
            aria-label={`${item.productName}（${item.variantLabel}）を削除`}
          >
            <Trash2 />
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          {item.variantLabel}
          <span className="mx-1.5">·</span>
          <span className="num">{formatYenJa(item.unitPrice)}</span>
        </p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
          <div className="flex flex-col gap-1">
            <QuantityStepper
              size="sm"
              value={item.quantity}
              max={item.maxQuantity}
              onChange={(n) => setQuantity(item.variantId, n)}
              label={item.productName}
            />
            {item.quantity >= item.maxQuantity && <span className="text-muted-foreground text-[11px]">在庫の上限です</span>}
          </div>
          <Price amount={item.unitPrice * item.quantity} size="sm" showTax={false} />
        </div>
      </div>
    </li>
  );
}

function FreeShippingMeter({ est }: { est: FarmEstimate }) {
  if (est.threshold == null) return null;
  const done = est.remainingForFree <= 0;
  return (
    <div className="space-y-1.5">
      <p className="text-xs">
        {done ? (
          <span className="text-leaf font-medium">送料無料の対象です</span>
        ) : (
          <>
            あと<span className="num text-primary mx-0.5 font-semibold">{formatYenJa(est.remainingForFree)}</span>
            でこの農家さんの送料が無料に
          </>
        )}
      </p>
      <Progress
        value={Math.round(est.freeProgress * 100)}
        aria-label="送料無料までの進捗"
        className={cn("h-1.5", done && "[&>[data-slot=progress-indicator]]:bg-leaf")}
      />
    </div>
  );
}

function FarmGroup({
  group,
  est,
  variant,
  onNavigate,
}: {
  group: { farmId: string; farmName: string; items: CartItem[] };
  est: FarmEstimate;
  variant: Variant;
  onNavigate?: () => void;
}) {
  const farmSlug = group.items[0]?.farmSlug;
  const carrier = carriers[est.quote.carrier];
  return (
    <section className={cn("rounded-2xl border", variant === "page" ? "bg-card p-5 sm:p-6" : "bg-card/60 p-4")}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-serif text-base font-semibold">
          <Tractor className="text-primary size-4" />
          {farmSlug ? (
            <Link href={routes.farm(farmSlug)} onClick={onNavigate} className="hover:underline">
              {group.farmName}
            </Link>
          ) : (
            group.farmName
          )}
        </h3>
        <span className="text-muted-foreground text-xs">この農家さんから直送</span>
      </header>
      <ul className="divide-y">
        {group.items.map((i) => (
          <LineItem key={i.variantId} item={i} variant={variant} onNavigate={onNavigate} />
        ))}
      </ul>
      <div className="bg-paper space-y-3 rounded-xl p-3.5 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
          <span className="text-muted-foreground inline-flex items-center gap-1.5">
            <Truck className="size-3.5" />
            送料（{carrier.label}・{est.quote.boxSize}サイズ×{est.quote.boxCount}・{formatWeight(est.quote.totalWeightGrams)}）
          </span>
          <span className="num font-semibold">{est.quote.isFree ? <span className="text-leaf">無料</span> : formatYenJa(est.quote.fee)}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
          <span className="text-muted-foreground inline-flex items-center gap-1.5">
            <CalendarCheck className="size-3.5" />
            最短お届け日
          </span>
          {est.schedule ? (
            <span className="font-semibold">{formatShortDate(fromYmd(est.schedule.earliestDeliveryDate))}</span>
          ) : (
            <Skeleton className="h-4 w-16" />
          )}
        </div>
        <FreeShippingMeter est={est} />
      </div>
    </section>
  );
}

function CartSkeleton() {
  return (
    <div className="space-y-4 p-1">
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="size-20 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-8 w-28 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Cart body shared by the slide-over sheet and the /cart page.
 * Shipping & dates are client-side estimates (lib/shipping); checkout re-quotes on the server.
 */
export function CartContents({ variant, onNavigate }: { variant: Variant; onNavigate?: () => void }) {
  const hydrated = useHydrated();
  const items = useCart((s) => s.items);
  const prefecture = useShippingPrefs((s) => s.prefecture);
  const today = useTodayYmd();

  if (!hydrated) return <CartSkeleton />;

  if (!items.length) {
    return (
      <EmptyState
        icon={ShoppingBasket}
        title="カートは空です"
        description="畑から届く旬の玉ねぎを見つけてみませんか。"
        className={cn(variant === "page" && "bg-paper/60 border py-16")}
      >
        <Button asChild className="h-11 rounded-full px-6" onClick={onNavigate}>
          <Link href={routes.products}>
            商品をさがす
            <ArrowRight />
          </Link>
        </Button>
      </EmptyState>
    );
  }

  const groups = groupByFarm(items).map((g) => ({ group: g, est: estimateFarmGroup(g.items, prefecture, today) }));
  const subtotal = cartSubtotal(items);
  const shipping = groups.reduce((a, g) => a + g.est.quote.fee, 0);
  const count = cartCount(items);

  const summary = (
    <div className="space-y-3">
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">商品小計（{count}点）</dt>
          <dd className="num">{formatYenJa(subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">送料（目安・{groups.length}農家分）</dt>
          <dd className="num">{formatYenJa(shipping)}</dd>
        </div>
        <Separator />
        <div className="flex items-baseline justify-between">
          <dt className="font-medium">合計（目安）</dt>
          <dd>
            <Price amount={subtotal + shipping} size="lg" />
          </dd>
        </div>
      </dl>
      <p className="text-muted-foreground text-[11px] leading-relaxed">
        送料とお届け日は {prefecture} 宛ての目安です。お届け先・希望日時はご注文手続きで確定します。
      </p>
      <Button asChild className="h-12 w-full rounded-full text-base" onClick={onNavigate}>
        <Link href={routes.checkout}>
          ご注文手続きへ
          <ArrowRight />
        </Link>
      </Button>
      {variant === "sheet" ? (
        <Button asChild variant="ghost" className="h-10 w-full rounded-full" onClick={onNavigate}>
          <Link href={routes.cart}>カートの詳細を見る</Link>
        </Button>
      ) : (
        <Button asChild variant="ghost" className="h-10 w-full rounded-full">
          <Link href={routes.products}>買い物を続ける</Link>
        </Button>
      )}
    </div>
  );

  const destination = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-muted-foreground text-xs">お届け先で送料・日程を試算</span>
      <PrefectureSelect />
    </div>
  );

  if (variant === "sheet") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b px-4 pb-3">{destination}</div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
          {groups.map(({ group, est }) => (
            <FarmGroup key={group.farmId} group={group} est={est} variant="sheet" onNavigate={onNavigate} />
          ))}
        </div>
        <div className="bg-background border-t px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{summary}</div>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
      <div className="space-y-5">
        <div className="bg-paper rounded-2xl px-4 py-3">{destination}</div>
        {groups.map(({ group, est }) => (
          <FarmGroup key={group.farmId} group={group} est={est} variant="page" />
        ))}
      </div>
      <aside className="bg-card rounded-2xl border p-5 sm:p-6 lg:sticky lg:top-24">
        <h2 className="heading-display mb-4 text-lg">ご注文内容</h2>
        {summary}
      </aside>
    </div>
  );
}
