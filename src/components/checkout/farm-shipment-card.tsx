import { CalendarClock, Package, Truck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Price } from "@/components/common/price";
import { ToneBadge } from "@/components/common/status-badge";
import { routes } from "@/config/nav";
import { carriers } from "@/config/shipping";
import { fromYmd } from "@/lib/dates";
import { formatShortDate, formatYenJa } from "@/lib/format";
import type { CheckoutQuote } from "@/server/actions/checkout";

type QuotedFarm = CheckoutQuote["farms"][number];

/** Per-farm shipment breakdown (1 farm = 1 box shipment). */
export function FarmShipmentCard({ farm }: { farm: QuotedFarm }) {
  const toFree = farm.freeShippingThreshold != null && !farm.isFreeShipping ? farm.freeShippingThreshold - farm.subtotal : null;
  return (
    <article className="overflow-hidden rounded-xl border">
      <header className="bg-muted/40 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <Link href={routes.farm(farm.farmSlug)} className="font-serif text-sm font-semibold hover:underline">
          {farm.farmName}
        </Link>
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Truck className="size-3.5" />
          {carriers[farm.carrier].label} {carriers[farm.carrier].service}
        </span>
      </header>
      <ul className="divide-y">
        {farm.lines.map((l) => (
          <li key={l.variantId} className="flex items-center gap-3 px-4 py-3">
            <div className="bg-muted relative size-12 shrink-0 overflow-hidden rounded-lg">
              {l.imageUrl && <Image src={l.imageUrl} alt={l.productName} fill sizes="48px" className="object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{l.productName}</p>
              <p className="text-muted-foreground text-xs">
                {l.variantLabel} × <span className="num">{l.quantity}</span>
              </p>
              {l.quantity > l.stock && (
                <p className="text-destructive text-xs">在庫が不足しています（残り{l.stock}点）</p>
              )}
            </div>
            <Price amount={l.lineTotal} size="sm" showTax={false} />
          </li>
        ))}
      </ul>
      <footer className="grid gap-2 border-t px-4 py-3 text-xs sm:grid-cols-3">
        <span className="text-muted-foreground flex items-center gap-1.5">
          <Package className="size-3.5" />
          {farm.boxSize}サイズ × {farm.boxCount}箱（{farm.zoneLabel}）
        </span>
        <span className="text-muted-foreground flex items-center gap-1.5">
          <CalendarClock className="size-3.5" />
          出荷予定 {formatShortDate(fromYmd(farm.shipByDate))}・お届け {formatShortDate(fromYmd(farm.estimatedDeliveryDate))}
        </span>
        <span className="flex items-center gap-2 sm:justify-end">
          {farm.isFreeShipping ? (
            <ToneBadge tone="success">送料無料</ToneBadge>
          ) : (
            <>
              <span className="text-muted-foreground">送料</span>
              <Price amount={farm.shippingFee} size="sm" showTax={false} />
            </>
          )}
        </span>
        {toFree != null && toFree > 0 && (
          <p className="text-primary sm:col-span-3">あと{formatYenJa(toFree)}のご注文でこの生産者の送料が無料になります</p>
        )}
      </footer>
    </article>
  );
}
