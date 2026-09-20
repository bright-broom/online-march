import { ArrowLeft, Gift, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddressBlock } from "@/components/checkout/address-block";
import { Price } from "@/components/common/price";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { CancelOrderButton } from "@/components/mypage/cancel-order-button";
import { FarmOrderSection } from "@/components/mypage/farm-order-section";
import { PaymentPendingCard } from "@/components/mypage/payment-pending-card";
import { ReorderButton } from "@/components/mypage/reorder-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { routes } from "@/config/nav";
import { paymentMethodLabel } from "@/config/payments";
import { deliveryTimeSlots, type DeliveryTimeSlot } from "@/config/shipping";
import { fromYmd } from "@/lib/dates";
import { formatDate, formatDateTime } from "@/lib/format";
import { requireRole } from "@/server/auth/guards";
import { getOrderDetail } from "@/server/queries/account";

export const metadata: Metadata = { title: "注文詳細" };

const providerLabel: Record<string, string> = { stripe: "クレジットカード等（Stripe）", demo: "デモ決済" };
/** 実際に使われた手段が分かっていればそれを、まだなら決済代行の名前を出す */
const paymentLabelOf = (o: { paymentMethod: string | null; paymentProvider: string }) =>
  paymentMethodLabel(o.paymentMethod) ?? providerLabel[o.paymentProvider] ?? o.paymentProvider;

export default async function OrderDetailPage({ params }: PageProps<"/mypage/orders/[id]">) {
  const { id } = await params;
  const user = await requireRole("customer", routes.mypage.order(id));
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const order = await getOrderDetail(user.id, id);
  if (!order) notFound();

  const allItems = order.farmOrders.flatMap((f) => f.items);
  const reorderItems = allItems.filter((i) => i.reorder).map((i) => ({ item: i.reorder!, quantity: Math.min(i.quantity, i.reorder!.maxQuantity) }));
  const slot = order.deliveryTimeSlot as DeliveryTimeSlot | null;
  const receiptAvailable = order.status === "paid";

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="text-muted-foreground mb-2 -ml-2">
        <Link href={routes.mypage.orders}><ArrowLeft />注文履歴</Link>
      </Button>
      <PageHeader
        title={<>注文番号 <span className="whitespace-nowrap">{order.code}</span></>}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {formatDateTime(order.createdAt)} ご注文
            <StatusBadge kind="order" status={order.status} />
          </span>
        }
        actions={
          <>
            <ReorderButton items={reorderItems} skipped={allItems.length - reorderItems.length} />
            {receiptAvailable && (
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <Link href={routes.mypage.receipt(order.id)}><ReceiptText />領収書</Link>
              </Button>
            )}
            {order.cancellable && <CancelOrderButton orderId={order.id} orderCode={order.code} />}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          {order.status === "pending_payment" && order.paymentMethod && (
            <PaymentPendingCard method={order.paymentMethod} voucherUrl={order.paymentVoucherUrl} dueAt={order.paymentDueAt} total={order.total} />
          )}
          {order.farmOrders.map((fo) => (
            <FarmOrderSection key={fo.id} fo={fo} />
          ))}
        </div>

        <aside className="space-y-6 xl:sticky xl:top-20 xl:self-start">
          <Card>
            <CardHeader><CardTitle className="text-base">お届け先</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <AddressBlock address={order.shippingAddress} />
              <Separator />
              <div className="text-sm">
                <p className="text-muted-foreground text-xs">ご希望日時</p>
                <p>
                  {order.desiredDeliveryDate ? formatDate(fromYmd(order.desiredDeliveryDate)) : "最短でお届け"}
                  {slot && deliveryTimeSlots[slot] ? `・${deliveryTimeSlots[slot].label}` : ""}
                </p>
              </div>
              {order.gift && (order.gift.wrapping || order.gift.noshi || order.gift.message) && (
                <div className="text-sm">
                  <p className="text-muted-foreground flex items-center gap-1 text-xs"><Gift className="size-3.5" />ギフト</p>
                  <p>{[order.gift.wrapping && "ラッピング", order.gift.noshi && `のし（${order.gift.noshi}）`].filter(Boolean).join("・") || "—"}</p>
                  {order.gift.message && <p className="text-muted-foreground mt-1 text-xs whitespace-pre-wrap">「{order.gift.message}」</p>}
                </div>
              )}
              {order.note && (
                <div className="text-sm">
                  <p className="text-muted-foreground text-xs">ご要望</p>
                  <p className="whitespace-pre-wrap">{order.note}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">お支払い</CardTitle></CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">商品小計</dt><dd><Price amount={order.subtotal} size="sm" showTax={false} /></dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">送料</dt><dd><Price amount={order.shippingTotal} size="sm" showTax={false} /></dd></div>
                {order.discountTotal > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">クーポン{order.couponCode ? `（${order.couponCode}）` : ""}</dt>
                    <dd className="text-leaf num">−{order.discountTotal.toLocaleString("ja-JP")}円</dd>
                  </div>
                )}
                <Separator className="my-2" />
                <div className="flex items-baseline justify-between"><dt className="font-medium">合計</dt><dd><Price amount={order.total} size="lg" /></dd></div>
              </dl>
              <div className="text-muted-foreground mt-4 space-y-1 text-xs">
                <p>お支払い方法：{paymentLabelOf(order)}</p>
                {order.paidAt && <p>お支払い日時：{formatDateTime(order.paidAt)}</p>}
                {order.cancelledAt && <p>キャンセル日時：{formatDateTime(order.cancelledAt)}</p>}
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
