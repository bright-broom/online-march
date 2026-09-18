import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/page-header";
import { OrdersTabs } from "@/components/mypage/orders-tabs";
import { routes } from "@/config/nav";
import { requireRole } from "@/server/auth/guards";
import { listOrders } from "@/server/queries/account";

export const metadata: Metadata = { title: "注文履歴" };

export default async function OrdersPage() {
  const user = await requireRole("customer", routes.mypage.orders);
  const orders = await listOrders(user.id);
  return (
    <>
      <PageHeader title="注文履歴" description="生産者ごとの配送状況は、各ご注文の詳細から確認できます。" />
      <OrdersTabs orders={orders} />
    </>
  );
}
