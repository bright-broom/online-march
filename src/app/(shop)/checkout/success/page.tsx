import { CheckCircle2, Clock, Mail, MessageCircle, Package, ReceiptText, Star, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AddressBlock } from "@/components/checkout/address-block";
import { SuccessEffects } from "@/components/checkout/success-effects";
import { EmptyState } from "@/components/common/empty-state";
import { Price } from "@/components/common/price";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { routes } from "@/config/nav";
import { carriers, deliveryTimeSlots, type DeliveryTimeSlot } from "@/config/shipping";
import { fromYmd } from "@/lib/dates";
import { formatShortDate } from "@/lib/format";
import { requireUser } from "@/server/auth/guards";
import { getOrderSummary } from "@/server/queries/account";

export const metadata: Metadata = { title: "ご注文ありがとうございます", robots: { index: false } };

const nextSteps = [
  { icon: Package, title: "収穫・箱詰め", body: "生産者が出荷日に合わせて収穫し、ていねいに箱詰めします。" },
  { icon: Truck, title: "発送のお知らせ", body: "発送されたら追跡番号をメールとマイページでお知らせします。" },
  { icon: Star, title: "届いたら感想を", body: "レビューは生産者さんの励みになります。" },
];

export default function CheckoutSuccessPage({ searchParams }: PageProps<"/checkout/success">) {
  return (
    <div className="container-page py-10 sm:py-16">
      <Suspense fallback={<SuccessSkeleton />}>
        <SuccessContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SuccessContent({ searchParams }: { searchParams: PageProps<"/checkout/success">["searchParams"] }) {
  const sp = await searchParams;
  const orderId = typeof sp.order === "string" ? sp.order : null;
  const sessionId = typeof sp.session_id === "string" ? sp.session_id : null;
  const user = await requireUser(routes.mypage.orders);
  const order = orderId && /^[0-9a-f-]{36}$/i.test(orderId) ? await getOrderSummary(user.id, orderId) : null;

  if (!order) {
    return (
      <EmptyState icon={ReceiptText} title="ご注文が見つかりません" description="ご注文の状況はマイページの注文履歴からご確認いただけます。" className="bg-card rounded-2xl border py-16">
        <Button asChild className="rounded-full">
          <Link href={routes.mypage.orders}>注文履歴を見る</Link>
        </Button>
      </EmptyState>
    );
  }

  const pending = order.status === "pending_payment";
  const slot = order.deliveryTimeSlot as DeliveryTimeSlot | null;

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <SuccessEffects orderId={order.id} sessionId={sessionId} pending={pending} />
      <header className="animate-fade-up space-y-4 text-center">
        <span className="bg-leaf/15 text-leaf mx-auto flex size-16 items-center justify-center rounded-full">
          {pending ? <Clock className="size-8" /> : <CheckCircle2 className="size-8" />}
        </span>
        <p className="eyebrow">Thank you</p>
        <h1 className="heading-display text-3xl sm:text-4xl">
          {pending ? "お支払いを確認しています" : "ご注文ありがとうございます"}
        </h1>
        <p className="text-muted-foreground mx-auto max-w-prose text-sm leading-relaxed">
          {pending ? (
            <span className="inline-flex items-center gap-2"><Spinner />決済の完了を確認中です。このままお待ちください。</span>
          ) : (
            <>
              南あわじの畑から、生産者が心をこめてお届けします。
              <br className="hidden sm:inline" />
              確認メールを <span className="text-foreground font-medium">{order.email}</span> にお送りしました。
            </>
          )}
        </p>
        <div className="bg-paper mx-auto inline-flex flex-wrap items-center justify-center gap-x-6 gap-y-2 rounded-2xl border px-6 py-3 text-sm">
          <span>
            <span className="text-muted-foreground mr-2">注文番号</span>
            <span className="num font-semibold tracking-wide">{order.code}</span>
          </span>
          <span>
            <span className="text-muted-foreground mr-2">お支払い合計</span>
            <Price amount={order.total} size="sm" />
          </span>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="heading-display text-lg">お届けの予定</h2>
        <ul className="grid gap-3">
          {order.farmOrders.map((fo) => (
            <li key={fo.id} className="bg-card flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={routes.farm(fo.farm.slug)} className="font-serif font-semibold hover:underline">{fo.farm.name}</Link>
                  <StatusBadge kind="farmOrder" status={fo.status} />
                </div>
                <p className="text-muted-foreground truncate text-xs">
                  {fo.items.map((i) => `${i.productName}（${i.variantLabel}）×${i.quantity}`).join("・")}
                </p>
              </div>
              <div className="shrink-0 text-sm sm:text-right">
                <p>
                  <span className="text-muted-foreground mr-2 text-xs">お届け予定</span>
                  <span className="font-medium">{fo.estimatedDeliveryDate ? formatShortDate(fromYmd(fo.estimatedDeliveryDate)) : "—"}</span>
                </p>
                <p className="text-muted-foreground text-xs">
                  {carriers[fo.carrier].label}・出荷予定 {fo.shipByDate ? formatShortDate(fromYmd(fo.shipByDate)) : "—"}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <div className="bg-muted/30 grid gap-4 rounded-2xl border p-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground mb-1 text-xs">お届け先</p>
            <AddressBlock address={order.shippingAddress} compact />
          </div>
          <div>
            <p className="text-muted-foreground mb-1 text-xs">ご希望日時</p>
            <p>
              {order.desiredDeliveryDate ? formatShortDate(fromYmd(order.desiredDeliveryDate)) : "最短でお届け"}
              {slot && deliveryTimeSlots[slot] ? `・${deliveryTimeSlots[slot].label}` : ""}
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="heading-display text-lg">このあとの流れ</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {nextSteps.map((s, i) => (
            <li key={s.title} className="bg-card space-y-2 rounded-2xl border p-4">
              <span className="text-primary flex items-center gap-2 text-xs font-medium">
                <span className="num">0{i + 1}</span>
                <s.icon className="size-4" />
              </span>
              <p className="text-sm font-medium">{s.title}</p>
              <p className="text-muted-foreground text-xs leading-relaxed">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button asChild size="lg" className="h-11 w-full rounded-full sm:w-auto">
          <Link href={routes.mypage.order(order.id)}><ReceiptText />注文詳細を見る</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="h-11 w-full rounded-full sm:w-auto">
          <Link href={routes.products}>買い物を続ける</Link>
        </Button>
      </div>
      <p className="text-muted-foreground flex items-center justify-center gap-4 text-xs">
        <span className="inline-flex items-center gap-1"><Mail className="size-3.5" />確認メールが届かない場合は迷惑メールフォルダもご確認ください</span>
        <Link href={routes.mypage.messages} className="hover:text-foreground inline-flex items-center gap-1 underline-offset-4 hover:underline">
          <MessageCircle className="size-3.5" />生産者に連絡
        </Link>
      </p>
    </div>
  );
}

function SuccessSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-8" aria-busy>
      <div className="flex flex-col items-center gap-4">
        <Skeleton className="size-16 rounded-full" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <Skeleton className="h-12 w-80 rounded-2xl" />
      </div>
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-32 rounded-2xl" />
    </div>
  );
}
