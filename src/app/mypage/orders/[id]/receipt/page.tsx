import { ArrowLeft, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/common/empty-state";
import { ReceiptView } from "@/components/mypage/receipt-view";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/nav";
import { paymentMethodLabel } from "@/config/payments";
import { requireRole } from "@/server/auth/guards";
import { getOrderSummary, getProfile } from "@/server/queries/account";

export const metadata: Metadata = { title: "領収書" };

const providerLabel: Record<string, string> = { stripe: "クレジットカード等", demo: "デモ決済" };

export default async function ReceiptPage({ params }: PageProps<"/mypage/orders/[id]/receipt">) {
  const { id } = await params;
  const user = await requireRole("customer", routes.mypage.order(id));
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [order, profile] = await Promise.all([getOrderSummary(user.id, id), getProfile(user.id)]);
  if (!order) notFound();

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="no-print text-muted-foreground mb-4 -ml-2">
        <Link href={routes.mypage.order(order.id)}><ArrowLeft />注文詳細に戻る</Link>
      </Button>
      {order.status === "paid" && order.paidAt ? (
        <ReceiptView
          data={{
            code: order.code,
            issuedAt: order.paidAt,
            total: order.total,
            subtotal: order.subtotal,
            shippingTotal: order.shippingTotal,
            discountTotal: order.discountTotal,
            paymentLabel: paymentMethodLabel(order.paymentMethod) ?? providerLabel[order.paymentProvider] ?? order.paymentProvider,
            defaultName: profile?.name ?? user.name,
          }}
        />
      ) : (
        <EmptyState
          icon={ReceiptText}
          title="領収書を発行できません"
          description="お支払いが完了したご注文のみ領収書を発行できます（キャンセル・返金済みのご注文は対象外です）。"
          className="bg-card rounded-xl border"
        />
      )}
    </>
  );
}
