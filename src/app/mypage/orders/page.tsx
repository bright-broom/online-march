import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/page-header";
import { OrdersTabs } from "@/components/mypage/orders-tabs";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { routes } from "@/config/nav";
import { requireRole } from "@/server/auth/guards";
import { countOrders, listOrders } from "@/server/queries/account";

export const metadata: Metadata = { title: "注文履歴" };

/** 1ページの件数。古いご注文は次のページから（#21。以前は最新50件で打ち切り、それより前は問い合わせてもらっていた） */
const PAGE_SIZE = 50;

export default async function OrdersPage({ searchParams }: PageProps<"/mypage/orders">) {
  const user = await requireRole("customer", routes.mypage.orders);
  const { page: pageParam } = await searchParams;
  const total = await countOrders(user.id);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(String(pageParam ?? "1"), 10) || 1));
  const orders = await listOrders(user.id, PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const href = (p: number) => (p === 1 ? routes.mypage.orders : `${routes.mypage.orders}?page=${p}`);
  return (
    <>
      <PageHeader title="注文履歴" description="生産者ごとの配送状況は、各ご注文の詳細から確認できます。" />
      <OrdersTabs orders={orders} />
      {pages > 1 && (
        <div className="mt-6 space-y-2">
          <p className="text-muted-foreground text-center text-xs">
            全{total}件中 {(page - 1) * PAGE_SIZE + 1}〜{Math.min(total, page * PAGE_SIZE)}件目（絞り込みはこのページの中で行います）
          </p>
          <Pagination>
            <PaginationContent>
              {page > 1 && (
                <PaginationItem>
                  <PaginationPrevious href={href(page - 1)} text="新しいご注文" />
                </PaginationItem>
              )}
              {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                <PaginationItem key={p}>
                  <PaginationLink href={href(p)} isActive={p === page}>
                    {p}
                  </PaginationLink>
                </PaginationItem>
              ))}
              {page < pages && (
                <PaginationItem>
                  <PaginationNext href={href(page + 1)} text="古いご注文" />
                </PaginationItem>
              )}
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </>
  );
}
