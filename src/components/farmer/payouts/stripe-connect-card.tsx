"use client";
import { BadgeCheck, Building2, CreditCard } from "lucide-react";
import { useActionState } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/common/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { feeConfig } from "@/config/fees";
import { formatNumber } from "@/lib/format";
import type { ActionResult } from "@/server/actions/_utils";
import { startStripeOnboarding } from "@/server/actions/farmer-shop";

/** 振込先の登録: Stripe Connect (when configured) or manual bank transfer mode. */
export function StripeConnectCard({ stripeEnabled, onboarded, hasAccount }: { stripeEnabled: boolean; onboarded: boolean; hasAccount: boolean }) {
  const [, action, pending] = useActionState(async (_prev: ActionResult | null) => {
    const res = await startStripeOnboarding();
    if (!res.ok) toast.error(res.error);
    return res;
  }, null);
  const cycle = `月末締め・翌月${feeConfig.payout.payoutDay}日払い（${formatNumber(feeConfig.payout.minimumAmount)}円未満は翌月へ繰越）`;

  if (!stripeEnabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="size-4" />お振込について</CardTitle>
          <CardDescription>{cycle}</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-2 text-sm leading-relaxed">
          <p>現在は運営からの銀行振込でお支払いしています。振込先は下の「振込先口座」から登録・変更できます。</p>
          <p className="text-xs">オンライン決済（Stripe）が有効になると、ここから振込先をご自身で登録できるようになります。</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={onboarded ? undefined : "border-primary/40"}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {onboarded ? <BadgeCheck className="text-leaf size-4" /> : <CreditCard className="size-4" />}
          {onboarded ? "振込先は登録済みです" : "振込先を登録しましょう"}
        </CardTitle>
        <CardDescription>{cycle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm leading-relaxed">
          {onboarded
            ? "売上は登録済みの口座へ自動でお振込します。口座や本人情報の変更は下のボタンから行えます。"
            : "Stripe（決済サービス）の画面で、本人確認と振込先口座を登録します。5分ほどで完了します。登録が済むまで精算は「振込予定」のまま保留されます。Stripe を使わない場合は、下の「振込先口座」を登録すると運営が銀行振込します。"}
        </p>
        <form action={action}>
          <SubmitButton pending={pending} variant={onboarded ? "outline" : "default"} className="w-full sm:w-auto">
            {onboarded ? "登録内容を確認・変更" : hasAccount ? "登録を続ける" : "振込先を登録"}
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
