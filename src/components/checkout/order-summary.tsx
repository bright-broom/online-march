"use client";
import { FlaskConical, Lock, ShieldCheck } from "lucide-react";
import { Price } from "@/components/common/price";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
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
