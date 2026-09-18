import { MessagesSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { CustomerThread } from "@/components/messages/customer-thread";
import { ThreadList, type ThreadListItem } from "@/components/messages/thread-list";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/nav";
import { cn } from "@/lib/utils";
import { requireRole } from "@/server/auth/guards";
import { getThreadFarm } from "@/server/queries/account";
import { getThread, listThreads } from "@/server/queries/messages";

export const metadata: Metadata = { title: "メッセージ" };

export default async function MessagesPage({ searchParams }: PageProps<"/mypage/messages">) {
  const user = await requireRole("customer", routes.mypage.messages);
  const { f } = await searchParams;
  const requested = typeof f === "string" ? f : null;
  const [threads, farm] = await Promise.all([listThreads({ customerId: user.id }), requested ? getThreadFarm(requested) : null]);
  const messages = farm ? await getThread(farm.id, user.id) : [];

  const items: ThreadListItem[] = threads.map((t) => ({
    key: t.farmId,
    href: `${routes.mypage.messages}?f=${t.farmId}`,
    name: t.farm?.name ?? "生産者",
    avatar: t.farm?.avatarImage,
    preview: t.lastBody,
    lastAt: t.lastAt,
    unread: t.farmId === farm?.id ? 0 : t.unread,
  }));
  if (farm && !items.some((i) => i.key === farm.id)) {
    items.unshift({ key: farm.id, href: `${routes.mypage.messages}?f=${farm.id}`, name: farm.name, avatar: farm.avatarImage, preview: "", lastAt: null, unread: 0 });
  }

  return (
    <>
      <PageHeader title="メッセージ" description="生産者さんに直接、質問や感想を送れます。" className={cn(farm && "hidden md:flex")} />
      <div className="bg-card grid h-[calc(100svh-13rem)] min-h-[28rem] overflow-hidden rounded-xl border md:grid-cols-[18rem_minmax(0,1fr)] lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className={cn("min-h-0 overflow-y-auto border-r", farm && "hidden md:block")}>
          <ThreadList items={items} activeKey={farm?.id} emptyText="まだメッセージはありません。生産者ページや注文詳細から話しかけてみましょう。" />
        </div>
        <div className={cn("min-h-0", !farm && "hidden md:block")}>
          {farm ? (
            <CustomerThread
              key={farm.id}
              viewerId={user.id}
              farm={farm}
              messages={messages.map((m) => ({ id: m.id, body: m.body, senderId: m.senderId, createdAt: m.createdAt }))}
            />
          ) : (
            <EmptyState
              icon={MessagesSquare}
              title={requested ? "生産者が見つかりません" : "会話を選んでください"}
              description={requested ? "この生産者には現在メッセージを送れません。" : "左の一覧から会話を選ぶと、ここに表示されます。"}
              className="h-full"
            >
              <Button asChild variant="outline" className="rounded-full">
                <Link href={routes.farms}>生産者を見る</Link>
              </Button>
            </EmptyState>
          )}
        </div>
      </div>
    </>
  );
}
