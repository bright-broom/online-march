import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/page-header";
import { OrdersTabs } from "@/components/mypage/orders-tabs";
import { routes } from "@/config/nav";
import { requireRole } from "@/server/auth/guards";
import { listOrders } from "@/server/queries/account";

export const metadata: Metadata = { title: "注文履歴" };

/** 何年も買ってくださる方の履歴が無限に伸びないよう、最新分だけ読む（運営の注文一覧と同じ考え方） */
const MAX_ORDERS = 50;

export default async function OrdersPage() {
  const user = await requireRole("customer", routes.mypage.orders);
  const orders = await listOrders(user.id, MAX_ORDERS);
  return (
    <>
      <PageHeader title="注文履歴" description="生産者ごとの配送状況は、各ご注文の詳細から確認できます。" />
      <OrdersTabs orders={orders} />
      {orders.length >= MAX_ORDERS && (
        <p className="text-muted-foreground mt-4 text-xs">
          最新{MAX_ORDERS}件を表示しています。それ以前のご注文は領収書の再発行を含め、お問い合わせください。
        </p>
      )}
    </>
  );
}
