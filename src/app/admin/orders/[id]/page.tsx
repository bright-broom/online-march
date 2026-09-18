import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { farmOrderRefundAmount, isFarmOrderRefunded, OrderDetailView } from "@/components/admin/orders/order-detail";
import { OrderRefundButton } from "@/components/admin/orders/farm-order-controls";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/nav";
import { features } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { requireRole } from "@/server/auth/guards";
import { getAdminOrder } from "@/server/queries/admin";

export const metadata: Metadata = { title: "注文の詳細" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminOrderDetailPage({ params }: PageProps<"/admin/orders/[id]">) {
  const { id } = await params;
  await requireRole("admin", routes.admin.order(id));
  if (!UUID.test(id)) notFound();
  const order = await getAdminOrder(id);
  if (!order) notFound();

  const viaStripe = order.paymentProvider === "stripe" && Boolean(order.stripePaymentIntentId);
  const canRefund = Boolean(order.paidAt) && order.status !== "refunded" && (!viaStripe || features.stripe);
  const open = order.farmOrders.filter((f) => !isFarmOrderRefunded(f));
  const hasShipped = open.some((f) => f.status === "shipped");
  const refundable = open.reduce((a, f) => a + farmOrderRefundAmount(f), 0);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="text-muted-foreground mb-2 -ml-2">
        <Link href={routes.admin.orders}><ArrowLeft />注文一覧</Link>
      </Button>
      <PageHeader
        title={<>注文 <span className="whitespace-nowrap">{order.code}</span></>}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge kind="order" status={order.status} />
            {formatDateTime(order.createdAt)}・{order.farmOrders.length}軒の生産者
          </span>
        }
        actions={
          canRefund && open.length > 0 ? (
            <OrderRefundButton
              orderId={order.id}
              code={order.code}
              amount={refundable}
              stripe={viaStripe}
              note={hasShipped ? "配送中の出荷単位があるため、配達完了までは返金できません。" : undefined}
            />
          ) : null
        }
      />
      {viaStripe && !features.stripe && (
        <p className="bg-destructive/10 text-destructive mb-4 rounded-lg px-3 py-2 text-xs">
          Stripe の環境変数が未設定のため、この注文の返金は実行できません。
        </p>
      )}
      <OrderDetailView order={order} canRefund={canRefund} />
    </>
  );
}
