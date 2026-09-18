import { ArrowLeft, MessagesSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { ThreadView } from "@/components/farmer/messages/thread-view";
import { itemsSummaryText } from "@/components/farmer/orders/items-summary";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/nav";
import { formatDate, formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireFarm } from "@/server/auth/guards";
import { getCustomerOrdersWithFarm, getFarmCustomer } from "@/server/queries/farmer";
import { getThread, listThreads, markThreadRead } from "@/server/queries/messages";

export const metadata: Metadata = { title: "メッセージ" };

export default async function FarmerMessagesPage({ searchParams }: PageProps<"/farmer/messages">) {
  const { user, farm } = await requireFarm();
  const sp = await searchParams;
  const c = typeof sp.c === "string" && sp.c.length <= 64 ? sp.c : null;
  await connection();
  const now = new Date();

  const threads = await listThreads({ farmId: farm.id, viewerId: user.id });
  // ownership: only customers who ordered from / messaged this farm
  const customer = c ? await getFarmCustomer(farm.id, c) : null;
  if (customer) await markThreadRead(farm.id, customer.id, user.id);
  const [messages, orders] = customer
    ? await Promise.all([getThread(farm.id, customer.id), getCustomerOrdersWithFarm(farm.id, customer.id)])
    : [[], []];

  return (
    <div>
      <PageHeader title="メッセージ" description="お客さまとのやりとり。ご注文の相談や、お礼のひとことに。" className={cn(customer && "hidden lg:flex")} />

      <div className="bg-card grid h-[calc(100svh-11rem)] min-h-[480px] overflow-hidden rounded-xl border lg:grid-cols-[280px_minmax(0,1fr)_260px]">
        {/* thread list */}
        <aside className={cn("min-h-0 overflow-y-auto border-r", customer && "hidden lg:block")}>
          {threads.length ? (
            <ul>
              {threads.map((t) => {
                const active = t.customerId === customer?.id;
                return (
                  <li key={t.customerId}>
                    <Link
                      href={`${routes.farmer.messages}?c=${t.customerId}`}
                      scroll={false}
                      className={cn("hover:bg-muted/60 flex gap-3 border-b px-4 py-3", active && "bg-primary/5")}
                    >
                      <Avatar className="size-9">
                        <AvatarFallback className="text-xs">{(t.customerName ?? "?").slice(0, 1)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn("truncate text-sm", t.unread > 0 && "font-semibold")}>{t.customerName ?? "お客さま"}</p>
                          <span className="text-muted-foreground shrink-0 text-[10px]">{formatRelative(t.lastAt, now)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-muted-foreground truncate text-xs">{t.lastBody}</p>
                          {t.unread > 0 && <span className="bg-primary text-primary-foreground num shrink-0 rounded-full px-1.5 text-[10px] leading-4">{t.unread}</span>}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={MessagesSquare} title="メッセージはまだありません" description="お客さまからのお問い合わせはここに届きます。" className="py-10" />
          )}
        </aside>

        {/* conversation */}
        <section className={cn("flex min-h-0 flex-col", !customer && "hidden lg:flex")}>
          {customer ? (
            <>
              <header className="flex items-center gap-2 border-b px-3 py-2.5">
                <Button asChild variant="ghost" size="icon" className="lg:hidden" aria-label="一覧へ戻る">
                  <Link href={routes.farmer.messages}><ArrowLeft /></Link>
                </Button>
                <p className="font-medium">{customer.name} さん</p>
              </header>
              <div className="min-h-0 flex-1">
                <ThreadView farmId={farm.id} customerId={customer.id} viewerId={user.id} messages={messages} />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState icon={MessagesSquare} title="スレッドを選んでください" description={c ? "このお客さまとのやりとりは表示できません。" : "左の一覧からお客さまを選ぶと、ここに会話が表示されます。"} />
            </div>
          )}
        </section>

        {/* customer side panel */}
        <aside className="hidden min-h-0 overflow-y-auto border-l p-4 lg:block">
          {customer ? (
            <div className="space-y-4">
              <div>
                <p className="text-muted-foreground text-xs">お客さま</p>
                <p className="font-medium">{customer.name} さん</p>
                <p className="text-muted-foreground text-[11px]">{formatDate(customer.createdAt)} から利用</p>
              </div>
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs">この農園でのご注文</p>
                {orders.length ? (
                  <ul className="space-y-2">
                    {orders.map((o) => (
                      <li key={o.id}>
                        <Link href={routes.farmer.order(o.id)} className="hover:bg-muted/50 block rounded-lg border p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px]">{o.code}</span>
                            <StatusBadge kind="farmOrder" status={o.status} className="text-[10px]" />
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs">{itemsSummaryText(o.items)}</p>
                          <p className="text-muted-foreground mt-1 flex justify-between text-[11px]">
                            <span>{formatDate(o.createdAt)}</span>
                            <span className="num">{formatNumber(o.subtotal)}円</span>
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-xs">まだご注文はありません</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">スレッドを選ぶと、お客さまのご注文履歴が表示されます。</p>
          )}
        </aside>
      </div>
    </div>
  );
}
