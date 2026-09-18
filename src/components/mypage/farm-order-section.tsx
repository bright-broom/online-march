import { CalendarClock, CheckCircle2, ExternalLink, MessageCircle, Package, Truck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Price } from "@/components/common/price";
import { StatusBadge, ToneBadge } from "@/components/common/status-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { routes } from "@/config/nav";
import { carriers } from "@/config/shipping";
import { fromYmd } from "@/lib/dates";
import { formatDateTime, formatShortDate } from "@/lib/format";
import type { OrderDetailFarmOrder } from "@/server/queries/account";
import { FulfillmentTracker } from "./fulfillment-tracker";
import { ReviewDialog } from "./review-dialog";
import { ShipmentTimeline } from "./shipment-timeline";

function Info({ icon: I, label, children }: { icon: typeof Truck; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <I className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 text-sm">
        <p className="text-muted-foreground text-xs">{label}</p>
        <div>{children}</div>
      </div>
    </div>
  );
}

export function FarmOrderSection({ fo }: { fo: OrderDetailFarmOrder }) {
  const carrier = carriers[fo.carrier];
  const delivered = fo.status === "delivered";
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="bg-muted/30 flex flex-row flex-wrap items-center justify-between gap-3 border-b py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-10">
            {fo.farm.avatarImage && <AvatarImage src={fo.farm.avatarImage} alt={fo.farm.name} />}
            <AvatarFallback className="bg-primary/15 text-primary font-serif">{fo.farm.name.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <Link href={routes.farm(fo.farm.slug)} className="block truncate font-serif font-semibold hover:underline">
              {fo.farm.name}
            </Link>
            <p className="text-muted-foreground num text-xs">{fo.code}</p>
          </div>
          <StatusBadge kind="farmOrder" status={fo.status} />
        </div>
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link href={`${routes.mypage.messages}?f=${fo.farm.id}`}>
            <MessageCircle />生産者にメッセージ
          </Link>
        </Button>
      </CardHeader>

      <CardContent className="space-y-6 py-5">
        <FulfillmentTracker status={fo.status} />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <ul className="divide-y rounded-xl border">
            {fo.items.map((it) => (
              <li key={it.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="bg-muted relative size-16 shrink-0 overflow-hidden rounded-lg">
                  {it.imageUrl && <Image src={it.imageUrl} alt={it.productName} fill sizes="64px" className="object-cover" />}
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  {it.productSlug ? (
                    <Link href={routes.product(it.productSlug)} className="line-clamp-2 text-sm font-medium hover:underline">{it.productName}</Link>
                  ) : (
                    <p className="line-clamp-2 text-sm font-medium">{it.productName}</p>
                  )}
                  <p className="text-muted-foreground text-xs">
                    {it.variantLabel}・<span className="num">{it.unitPrice.toLocaleString("ja-JP")}</span>円 × <span className="num">{it.quantity}</span>
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Price amount={it.lineTotal} size="sm" showTax={false} />
                  {delivered && it.productId && (it.reviewed ? (
                    <ToneBadge tone="success"><CheckCircle2 className="size-3" />レビュー済み</ToneBadge>
                  ) : (
                    <ReviewDialog productId={it.productId} farmOrderId={fo.id} productName={it.productName} variantLabel={it.variantLabel} imageUrl={it.imageUrl} />
                  ))}
                </div>
              </li>
            ))}
          </ul>

          <div className="space-y-4">
            <Info icon={Truck} label="配送">
              <p>{carrier.label} {carrier.service}</p>
              {fo.trackingNumber ? (
                <a
                  href={carrier.trackingUrl(fo.trackingNumber)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
                >
                  追跡番号 <span className="num">{fo.trackingNumber}</span>
                  <ExternalLink className="size-3" />
                </a>
              ) : (
                <p className="text-muted-foreground text-xs">発送後に追跡番号が表示されます</p>
              )}
            </Info>
            <Info icon={CalendarClock} label={delivered ? "お届け日" : "お届け予定"}>
              {delivered && fo.deliveredAt ? formatDateTime(fo.deliveredAt) : fo.estimatedDeliveryDate ? formatShortDate(fromYmd(fo.estimatedDeliveryDate)) : "—"}
              {!delivered && fo.shipByDate && (
                <p className="text-muted-foreground text-xs">出荷予定 {formatShortDate(fromYmd(fo.shipByDate))}</p>
              )}
            </Info>
            <Info icon={Package} label="荷姿">
              {fo.boxSize}サイズ × {fo.boxCount}箱
            </Info>
          </div>
        </div>

        <div>
          <p className="mb-3 text-sm font-medium">配送の記録</p>
          <ShipmentTimeline events={fo.events} />
        </div>
      </CardContent>

      <CardFooter className="bg-muted/20 flex flex-wrap justify-end gap-x-6 gap-y-1 border-t py-3 text-xs">
        <span className="text-muted-foreground">小計 <Price amount={fo.subtotal} size="sm" showTax={false} /></span>
        <span className="text-muted-foreground">
          送料 {fo.shippingFee === 0 ? <span className="text-leaf font-medium">無料</span> : <Price amount={fo.shippingFee} size="sm" showTax={false} />}
        </span>
        {fo.discount > 0 && <span className="text-muted-foreground">割引 −{fo.discount.toLocaleString("ja-JP")}円</span>}
      </CardFooter>
    </Card>
  );
}
