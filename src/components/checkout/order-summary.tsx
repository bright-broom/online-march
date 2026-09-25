"use client";
import { FlaskConical, Lock, RotateCcw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Price } from "@/components/common/price";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cancellationPolicy } from "@/config/content";
import { routes } from "@/config/nav";
import { listedPaymentMethodLabels } from "@/config/payments";
import { cn } from "@/lib/utils";
import type { CheckoutQuote } from "@/server/actions/checkout";

export type PaymentMode = "stripe" | "demo";

function Row({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 text-sm", className)}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function OrderSummary({
  quote, fallbackSubtotal, itemCount, loading, placing, canPlace, paymentMode, onPlace, coupon,
}: {
  quote: CheckoutQuote | null;
  fallbackSubtotal: number;
  itemCount: number;
  loading: boolean;
  placing: boolean;
  canPlace: boolean;
  paymentMode: PaymentMode;
  onPlace: () => void;
  coupon: React.ReactNode;
}) {
  return (
    <div className="bg-card space-y-5 rounded-2xl border p-5 sm:p-6">
      <h2 className="heading-display text-lg">ご注文内容</h2>
      <dl className={cn("space-y-2.5 transition-opacity", loading && "opacity-60")}>
        <Row label={`商品小計（${itemCount}点）`}>
          <Price amount={quote?.subtotal ?? fallbackSubtotal} size="sm" showTax={false} />
        </Row>
        <Row label={quote ? `送料（${quote.farms.length}便）` : "送料"}>
          {quote ? (
            quote.shippingTotal === 0 ? <span className="text-leaf text-sm font-medium">無料</span> : <Price amount={quote.shippingTotal} size="sm" showTax={false} />
          ) : loading ? (
            <Skeleton className="h-4 w-16" />
          ) : (
            <span className="text-muted-foreground text-xs">お届け先選択後に計算</span>
          )}
        </Row>
        {quote && quote.discountTotal > 0 && (
          <Row label="クーポン割引">
            <span className="text-leaf num text-sm font-semibold">−{quote.discountTotal.toLocaleString("ja-JP")}円</span>
          </Row>
        )}
        <Separator />
        <div className="flex items-baseline justify-between gap-3 pt-1">
          <dt className="font-medium">お支払い合計</dt>
          <dd>
            {quote ? <Price amount={quote.total} size="xl" /> : <span className="text-muted-foreground text-sm">—</span>}
          </dd>
        </div>
      </dl>

      {coupon}

      {paymentMode === "demo" && (
        <Alert className="border-primary/30 bg-primary/5">
          <FlaskConical />
          <AlertTitle>デモ決済モード</AlertTitle>
          <AlertDescription className="text-xs">
            決済サービスが未設定のため、実際のお支払いは発生しません。「注文を確定する」でそのまま注文が完了します。
          </AlertDescription>
        </Alert>
      )}

      {/* 最終確認画面の表示義務（特商法 第12条の6）: 解除に関する事項を確定ボタンの直前に出す */}
      <div className="bg-muted/50 space-y-1 rounded-lg p-3 text-xs leading-relaxed" data-testid="cancellation-policy">
        <p className="flex items-center gap-1.5 font-medium">
          <RotateCcw className="size-3.5" />
          キャンセル・返品について
        </p>
        <p className="text-muted-foreground">{cancellationPolicy}</p>
        <p>
          <Link href={routes.legal.tokushoho} target="_blank" className="text-primary underline-offset-4 hover:underline">
            特定商取引法に基づく表記
          </Link>
          {" ・ "}
          <Link href={routes.legal.terms} target="_blank" className="text-primary underline-offset-4 hover:underline">
            利用規約
          </Link>
        </p>
      </div>

      <Button type="button" size="lg" className="h-12 w-full rounded-full text-base" disabled={!canPlace || placing} onClick={onPlace}>
        {placing ? <Spinner /> : <Lock />}
        {paymentMode === "stripe" ? "お支払いへ進む" : "注文を確定する"}
      </Button>
      <p className="text-muted-foreground flex items-start gap-1.5 text-xs leading-relaxed">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        {paymentMode === "stripe"
          ? `${listedPaymentMethodLabels.join("・")}に対応。お支払い情報は Stripe の安全な決済ページで入力し、当サイトには保存されません。`
          : "ご注文確定後、確認メールとマイページで内容をご確認いただけます。"}
      </p>
    </div>
  );
}
