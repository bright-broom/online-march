import { CalendarDays, ExternalLink, Gift, MessageCircle, Package, Printer, StickyNote } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { CopyButton } from "@/components/farmer/copy-button";
import { OrderActionPanel } from "@/components/farmer/orders/order-action-panel";
import { OrderTimeline } from "@/components/farmer/orders/order-timeline";
import { ShipByBadge } from "@/components/farmer/ship-by";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { canFarm } from "@/config/farm-staff";
import { bpsToPercent } from "@/config/fees";
import { routes } from "@/config/nav";
import { carriers, deliveryTimeSlots, type DeliveryTimeSlot } from "@/config/shipping";
import { fromYmd, toYmd } from "@/lib/dates";
import { formatDate, formatDateTime, formatNumber, formatPostalCode, formatWeight } from "@/lib/format";
import { requireFarm } from "@/server/auth/guards";
import { getFarmOrder } from "@/server/queries/farmer";

export const metadata: Metadata = { title: "注文詳細" };

function Row({ label, children, strong }: { label: React.ReactNode; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className={strong ? "flex items-baseline justify-between gap-4 text-base font-semibold" : "flex items-baseline justify-between gap-4 text-sm"}>
      <dt className={strong ? "" : "text-muted-foreground"}>{label}</dt>
      <dd className="num">{children}</dd>
    </div>
  );
}

export default async function FarmerOrderPage({ params }: PageProps<"/farmer/orders/[id]">) {
  const { id } = await params;
  const { farm, access } = await requireFarm("ship");
  // 手数料と受取額は精算の情報なのでオーナーだけ（#24）。キャンセルは「すべて」のスタッフまで
  const seesMoney = canFarm(access, "money");
  const fo = /^[0-9a-f-]{36}$/i.test(id) ? await getFarmOrder(farm.id, id) : null;
  if (!fo) notFound();
  await connection();
  const today = toYmd(new Date());

  const a = fo.order.shippingAddress;
  const addressText = `〒${formatPostalCode(a.postalCode)}\n${a.prefecture}${a.city}${a.line1}${a.line2 ? ` ${a.line2}` : ""}\n${a.recipientName} 様\nTEL ${a.phone}`;
  const gift = fo.order.gift;
  const slot = fo.order.deliveryTimeSlot ? deliveryTimeSlots[fo.order.deliveryTimeSlot as DeliveryTimeSlot]?.label : null;
  const isOpen = fo.status === "paid" || fo.status === "preparing";

  return (
    <div>
      <PageHeader
        title={<>注文 <span className="whitespace-nowrap">{fo.code}</span></>}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge kind="farmOrder" status={fo.status} />
            <span>{formatDateTime(fo.createdAt)} 受付</span>
          </span>
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`${routes.farmer.messages}?c=${fo.customer.id}`}><MessageCircle />お客さまにメッセージ</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={routes.farmer.slip(fo.id)} target="_blank"><Printer />納品書を印刷</Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>お届け先</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <address className="text-sm leading-relaxed not-italic">
                  <p className="text-base font-semibold">{a.recipientName} 様{a.recipientKana && <span className="text-muted-foreground ml-2 text-xs font-normal">{a.recipientKana}</span>}</p>
                  <p>〒{formatPostalCode(a.postalCode)}</p>
                  <p>{a.prefecture}{a.city}{a.line1}</p>
                  {a.line2 && <p>{a.line2}</p>}
                  <p className="tabular-nums">TEL {a.phone}</p>
                </address>
                <CopyButton text={addressText} label="住所をコピー" />
              </div>
              <p className="text-muted-foreground text-xs">ご注文者：{fo.customer.name} さん</p>
            </CardContent>
          </Card>

          <div className="grid gap-6 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CalendarDays className="size-4" />日程</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2">
                  <Row label="出荷期限">{isOpen ? <ShipByBadge shipByDate={fo.shipByDate} today={today} /> : fo.shipByDate ? formatDate(fromYmd(fo.shipByDate)) : "—"}</Row>
                  <Row label="お届け希望日">{fo.order.desiredDeliveryDate ? formatDate(fromYmd(fo.order.desiredDeliveryDate)) : "指定なし"}</Row>
                  <Row label="時間帯">{slot ?? "指定なし"}</Row>
                  <Row label="お届け予定">{fo.estimatedDeliveryDate ? formatDate(fromYmd(fo.estimatedDeliveryDate)) : "—"}</Row>
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Package className="size-4" />配送</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2">
                  <Row label="配送業者">{carriers[fo.carrier].label}</Row>
                  <Row label="箱">{fo.boxSize}サイズ × {fo.boxCount}</Row>
                  <Row label="重量（梱包込み）">{formatWeight(fo.totalWeightGrams)}</Row>
                  <Row label="追跡番号">
                    {fo.trackingNumber ? (
                      <a href={carriers[fo.carrier].trackingUrl(fo.trackingNumber)} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">
                        {fo.trackingNumber}<ExternalLink className="size-3" />
                      </a>
                    ) : "未登録"}
                  </Row>
                  {fo.labelPrintedAt && <Row label="送り状データ">{formatDateTime(fo.labelPrintedAt)}</Row>}
                </dl>
              </CardContent>
            </Card>
          </div>

          {(gift || fo.order.note) && (
            <Card className="border-onion-red/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Gift className="text-onion-red size-4" />ギフト・ご要望</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {gift?.wrapping && <p>ギフト包装：あり</p>}
                {gift?.noshi && <p>のし：{gift.noshi}</p>}
                {gift?.message && (
                  <blockquote className="bg-muted/50 rounded-lg border-l-4 border-onion-red/40 p-3 leading-relaxed whitespace-pre-wrap">{gift.message}</blockquote>
                )}
                {fo.order.note && (
                  <p className="flex gap-2"><StickyNote className="text-muted-foreground mt-0.5 size-4 shrink-0" /><span className="whitespace-pre-wrap">{fo.order.note}</span></p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>ご注文内容</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="divide-y">
                {fo.items.map((it) => (
                  <li key={it.id} className="flex items-center gap-3 py-3 first:pt-0">
                    <span className="bg-muted relative size-14 shrink-0 overflow-hidden rounded-lg border">
                      {it.imageUrl && <Image src={it.imageUrl} alt={it.productName} fill sizes="56px" className="object-cover" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{it.productName}</p>
                      <p className="text-muted-foreground text-xs">{it.variantLabel}・{formatNumber(it.unitPrice)}円 × {it.quantity}</p>
                    </div>
                    <p className="num text-sm font-medium">{formatNumber(it.lineTotal)}円</p>
                  </li>
                ))}
              </ul>
              <Separator />
              <dl className="space-y-2">
                <Row label="商品小計">{formatNumber(fo.subtotal)}円</Row>
                <Row label="送料">{formatNumber(fo.shippingFee)}円</Row>
                {seesMoney && (
                  <>
                    <Row label={`販売手数料 ${bpsToPercent(fo.commissionRateBps)}%`}>−{formatNumber(fo.commissionAmount)}円</Row>
                    <Separator />
                    <Row label="お受取額" strong>{formatNumber(fo.payoutAmount)}円</Row>
                  </>
                )}
                {seesMoney && fo.discount > 0 && <p className="text-muted-foreground text-xs">※ クーポン割引 {formatNumber(fo.discount)}円 は運営負担のため、お受取額は変わりません。</p>}
              </dl>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <OrderActionPanel id={fo.id} status={fo.status} carrier={fo.carrier} trackingNumber={fo.trackingNumber} allowCancel={canFarm(access, "cancel")} />
          <Card>
            <CardHeader>
              <CardTitle>履歴</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderTimeline events={fo.events} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
