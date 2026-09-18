import { CreditCard, ExternalLink, Gift, MapPin, UserRound } from "lucide-react";
import Link from "next/link";
import { Icon } from "@/components/common/icon";
import { Price } from "@/components/common/price";
import { StatusBadge, ToneBadge } from "@/components/common/status-badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { bpsToPercent } from "@/config/fees";
import { routes } from "@/config/nav";
import { carriers, deliveryTimeSlots, type DeliveryTimeSlot } from "@/config/shipping";
import { shipmentEventMeta } from "@/config/status";
import { formatDate, formatDateTime, formatPostalCode, formatWeight, formatYen } from "@/lib/format";
import { cn } from "@/lib/utils";
import { REFUND_NOTE_PREFIX } from "@/lib/validators/admin";
import type { AdminOrderDetail } from "@/server/queries/admin";
import { eventSourceLabels, paymentProviderMeta } from "../labels";
import { DetailList, PanelCard } from "../primitives";
import { FarmOrderControls } from "./farm-order-controls";

type FarmOrderDetail = AdminOrderDetail["farmOrders"][number];

export const isFarmOrderRefunded = (fo: FarmOrderDetail) =>
  fo.status === "refunded" || fo.events.some((e) => e.source === "admin" && e.message.startsWith(REFUND_NOTE_PREFIX));
export const farmOrderRefundAmount = (fo: FarmOrderDetail) => Math.max(0, fo.subtotal + fo.shippingFee - fo.discount);

export function OrderDetailView({ order, canRefund }: { order: AdminOrderDetail; canRefund: boolean }) {
  const a = order.shippingAddress;
  const provider = paymentProviderMeta[order.paymentProvider] ?? { label: order.paymentProvider, tone: "neutral" as const };
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        {order.farmOrders.map((fo) => (
          <FarmOrderCard key={fo.id} orderId={order.id} fo={fo} canRefund={canRefund} />
        ))}
      </div>

      <div className="space-y-4">
        <PanelCard title="お客さま" action={<UserRound className="text-muted-foreground size-4" />}>
          <DetailList
            rows={[
              ["氏名", order.user.name],
              ["メール", <a key="m" href={`mailto:${order.email}`} className="hover:underline">{order.email}</a>],
              ["電話", order.user.phone ?? a.phone],
              ["会員登録", formatDate(order.user.createdAt)],
            ]}
          />
        </PanelCard>
        <PanelCard title="お届け先" action={<MapPin className="text-muted-foreground size-4" />}>
          <address className="space-y-1 text-sm not-italic">
            <p className="font-medium">{a.recipientName}{a.recipientKana ? <span className="text-muted-foreground ml-2 text-xs">{a.recipientKana}</span> : null}</p>
            <p>〒{formatPostalCode(a.postalCode)}</p>
            <p>{a.prefecture}{a.city}{a.line1}</p>
            {a.line2 && <p>{a.line2}</p>}
            <p className="text-muted-foreground text-xs">TEL {a.phone}</p>
          </address>
          <Separator className="my-3" />
          <DetailList
            rows={[
              ["希望日", order.desiredDeliveryDate ? formatDate(order.desiredDeliveryDate) : "最短"],
              ["時間帯", deliveryTimeSlots[(order.deliveryTimeSlot ?? "none") as DeliveryTimeSlot]?.label ?? "指定なし"],
            ]}
          />
        </PanelCard>
        <PanelCard title="お支払い" action={<CreditCard className="text-muted-foreground size-4" />}>
          <div className="space-y-2 text-sm">
            <Row label="商品小計" value={formatYen(order.subtotal)} />
            <Row label="送料" value={formatYen(order.shippingTotal)} />
            {order.discountTotal > 0 && <Row label={`クーポン${order.couponCode ? `（${order.couponCode}）` : ""}`} value={`−${formatYen(order.discountTotal)}`} />}
            <Separator />
            <div className="flex items-baseline justify-between">
              <span className="font-medium">合計</span>
              <Price amount={order.total} size="lg" />
            </div>
          </div>
          <Separator className="my-3" />
          <DetailList
            rows={[
              ["決済方法", <ToneBadge key="p" tone={provider.tone}>{provider.label}</ToneBadge>],
              ["状態", <StatusBadge key="s" kind="order" status={order.status} />],
              ["支払日時", formatDateTime(order.paidAt)],
              ["PaymentIntent", order.stripePaymentIntentId ? <code key="pi" className="bg-muted rounded px-1.5 py-0.5 text-[11px] break-all">{order.stripePaymentIntentId}</code> : "—"],
              ["Session", order.stripeSessionId ? <code key="cs" className="bg-muted rounded px-1.5 py-0.5 text-[11px] break-all">{order.stripeSessionId}</code> : "—"],
              ...(order.cancelledAt ? ([["キャンセル", formatDateTime(order.cancelledAt)]] as [string, string][]) : []),
            ]}
          />
        </PanelCard>
        {(order.gift || order.note) && (
          <PanelCard title="ギフト・備考" action={<Gift className="text-muted-foreground size-4" />}>
            <DetailList
              rows={[
                ...(order.gift ? ([["ギフト包装", order.gift.wrapping ? "あり" : "なし"], ["のし", order.gift.noshi || "—"], ["メッセージ", order.gift.message || "—"]] as [string, string][]) : []),
                ...(order.note ? ([["備考", order.note]] as [string, string][]) : []),
              ]}
            />
          </PanelCard>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

function FarmOrderCard({ orderId, fo, canRefund }: { orderId: string; fo: FarmOrderDetail; canRefund: boolean }) {
  const c = carriers[fo.carrier];
  const refunded = isFarmOrderRefunded(fo);
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <Link href={routes.admin.farm(fo.farm.id)} className="hover:underline">{fo.farm.name}</Link>
          <StatusBadge kind="farmOrder" status={fo.status} />
          {refunded && fo.status !== "refunded" && <ToneBadge tone="danger">返金済み</ToneBadge>}
        </CardTitle>
        <CardDescription className="num text-xs">{fo.code}</CardDescription>
        <CardAction className="text-muted-foreground text-right text-xs">
          出荷期限
          <p className="text-foreground text-sm font-medium">{formatDate(fo.shipByDate)}</p>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-5">
        <ul className="divide-y rounded-xl border">
          {fo.items.map((it) => (
            <li key={it.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{it.productName}</p>
                <p className="text-muted-foreground text-xs">{it.variantLabel}・{formatYen(it.unitPrice)} × {it.quantity}</p>
              </div>
              <span className="num shrink-0">{formatYen(it.lineTotal)}</span>
            </li>
          ))}
        </ul>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="bg-muted/40 space-y-1.5 rounded-xl p-3 text-xs">
            <Row label="商品代金" value={formatYen(fo.subtotal)} />
            <Row label="送料" value={formatYen(fo.shippingFee)} />
            {fo.discount > 0 && <Row label="クーポン配分（運営負担）" value={`−${formatYen(fo.discount)}`} />}
            <Row label={`販売手数料（${bpsToPercent(fo.commissionRateBps)}%）`} value={`−${formatYen(fo.commissionAmount)}`} />
            <Separator className="my-1" />
            <div className="flex items-center justify-between font-medium">
              <span>生産者への精算額</span>
              <span className="num text-sm">{formatYen(fo.payoutAmount)}</span>
            </div>
            <p className="text-muted-foreground pt-1">{fo.payoutId ? "精算済み（月次締めに含まれています）" : "未精算"}</p>
          </div>
          <DetailList
            className="grid-cols-[5.5rem_1fr] text-xs"
            rows={[
              ["配送", `${c.label}（${c.service}）`],
              ["荷姿", `${fo.boxSize}サイズ × ${fo.boxCount}箱・${formatWeight(fo.totalWeightGrams)}`],
              [
                "追跡番号",
                fo.trackingNumber ? (
                  <a key="t" href={c.trackingUrl(fo.trackingNumber)} target="_blank" rel="noreferrer" className="num text-primary inline-flex items-center gap-1 hover:underline">
                    {fo.trackingNumber}
                    <ExternalLink className="size-3" />
                  </a>
                ) : (
                  "—"
                ),
              ],
              ["お届け予定", formatDate(fo.estimatedDeliveryDate)],
              ["送り状発行", formatDateTime(fo.labelPrintedAt)],
              ["発送", formatDateTime(fo.shippedAt)],
              ["配達完了", formatDateTime(fo.deliveredAt)],
            ]}
          />
        </div>

        <div>
          <p className="text-muted-foreground mb-2 text-xs font-medium">タイムライン</p>
          {fo.events.length ? (
            <ol className="relative space-y-3 border-l pl-5">
              {fo.events.map((e) => {
                const meta = shipmentEventMeta[e.type];
                const isRefund = e.source === "admin" && e.message.startsWith(REFUND_NOTE_PREFIX);
                return (
                  <li key={e.id} className="relative">
                    <span
                      className={cn(
                        "bg-background absolute top-0.5 -left-[29px] grid size-[18px] place-items-center rounded-full border",
                        isRefund ? "text-destructive" : e.type === "delivered" ? "text-leaf" : "text-primary",
                      )}
                    >
                      <Icon name={meta.icon} className="size-3" />
                    </span>
                    <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-medium">{meta.label}</span>
                      <span className="text-muted-foreground text-xs">{formatDateTime(e.occurredAt)}</span>
                      <span className="text-muted-foreground text-[11px]">{eventSourceLabels[e.source] ?? e.source}</span>
                    </div>
                    {(e.message || e.location) && (
                      <p className="text-muted-foreground text-xs">{[e.message, e.location].filter(Boolean).join("・")}</p>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-muted-foreground text-xs">まだ記録はありません</p>
          )}
        </div>

        {fo.farmerNote && <p className="bg-gold-soft/40 rounded-lg p-3 text-xs">生産者メモ：{fo.farmerNote}</p>}

        <Separator />
        <FarmOrderControls
          orderId={orderId}
          canRefund={canRefund}
          fo={{
            id: fo.id,
            code: fo.code,
            status: fo.status,
            carrier: fo.carrier,
            trackingNumber: fo.trackingNumber,
            payoutId: fo.payoutId,
            refundAmount: farmOrderRefundAmount(fo),
            refunded,
          }}
        />
      </CardContent>
    </Card>
  );
}
