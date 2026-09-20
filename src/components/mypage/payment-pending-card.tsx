import { ExternalLink, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { paymentMethodLabel } from "@/config/payments";
import { formatDateTime, formatYen } from "@/lib/format";

/**
 * コンビニ払いなど、支払い番号を先に発行するタイプの入金待ち案内。
 * 番号ページを失くすと支払えないので、注文ページから必ずたどれるようにする。
 */
export function PaymentPendingCard({ method, voucherUrl, dueAt, total }: { method: string | null; voucherUrl: string | null; dueAt: Date | null; total: number }) {
  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Store className="size-4" />
          {paymentMethodLabel(method) ?? "お支払い"}のお手続きが未完了です
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground leading-relaxed">
          お支払い（{formatYen(total)}）が確認できしだい、生産者が出荷の準備を始めます。
          {dueAt && <>お支払い期限は <span className="text-foreground font-medium">{formatDateTime(dueAt)}</span> です。</>}
          期限を過ぎるとご注文は自動的にキャンセルとなります。
        </p>
        {voucherUrl && (
          <Button asChild className="rounded-full">
            <a href={voucherUrl} target="_blank" rel="noreferrer">お支払い番号を表示<ExternalLink /></a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
