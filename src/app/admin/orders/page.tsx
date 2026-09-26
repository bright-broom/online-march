import type { Metadata } from "next";
import { OrdersTable } from "@/components/admin/orders/orders-table";
import { FilterTabs } from "@/components/admin/primitives";
import { ServerSearch } from "@/components/admin/server-search";
import { PageHeader } from "@/components/dashboard/page-header";
import { routes } from "@/config/nav";
import { orderStatusMeta } from "@/config/status";
import type { OrderStatus } from "@/db/schema/marketplace";
import { requireRole } from "@/server/auth/guards";
import { getAdminOrders } from "@/server/queries/admin";

export const metadata: Metadata = { title: "注文" };

const statuses = Object.keys(orderStatusMeta) as OrderStatus[];

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  await requireRole("admin", routes.admin.orders);
  const sp = await searchParams;
  const status = statuses.find((s) => s === sp.status);
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) || undefined : undefined;
  const { rows, counts } = await getAdminOrders(status, 500, q);
  const total = Object.values(counts).reduce((a, n) => a + (n ?? 0), 0);

  return (
    <>
      <PageHeader title="注文" description="すべての注文と決済の状況。詳細から出荷状況の変更や返金ができます。" />
      <div className="space-y-4">
        <FilterTabs
          basePath={routes.admin.orders}
          param="status"
          current={status ?? "all"}
          items={[
            { value: "all", label: "すべて", count: total },
            ...statuses.map((s) => ({ value: s, label: orderStatusMeta[s].label, count: counts[s] ?? 0 })),
          ]}
        />
        <ServerSearch action={routes.admin.orders} q={q} placeholder="注文番号・メール・お名前で全件から探す" keep={{ status }} />
        {q && <p className="text-muted-foreground text-xs">「{q}」の検索結果: {rows.length}件{rows.length >= 500 ? "（最新500件まで）" : ""}</p>}
        <OrdersTable rows={rows} />
        {!q && rows.length >= 500 && <p className="text-muted-foreground text-xs">最新500件を表示しています。それより前の注文は上の検索で探せます。</p>}
      </div>
    </>
  );
}
