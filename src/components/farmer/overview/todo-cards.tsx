import Link from "next/link";
import { routes } from "@/config/nav";
import { cn } from "@/lib/utils";
import type { FarmTodos } from "@/server/queries/farmer";

type Todo = { key: keyof FarmTodos; label: string; hint: string; href: string; urgent?: boolean };

const todoDefs: Todo[] = [
  { key: "overdue", label: "期限超過", hint: "出荷期限を過ぎた注文", href: routes.farmer.shipping, urgent: true },
  { key: "dueToday", label: "本日出荷期限", hint: "今日中に発送", href: routes.farmer.shipping, urgent: true },
  { key: "newOrders", label: "新規受注", hint: "発送の準備をする", href: `${routes.farmer.orders}?tab=paid` },
  { key: "unreadMessages", label: "未読メッセージ", hint: "お客さまからの連絡", href: routes.farmer.messages },
  { key: "lowStock", label: "在庫わずか", hint: "規格の在庫を補充", href: `${routes.farmer.products}?status=active` },
];

/** Today's to-dos as tappable action cards. `setupPending`: 「販売を始めるまで」が残っている間は「すべて完了」を出さない */
export function TodoCards({ todos, setupPending = false }: { todos: FarmTodos; setupPending?: boolean }) {
  const active = todoDefs.filter((t) => todos[t.key] > 0);
  if (!active.length) {
    if (setupPending) return <p className="text-muted-foreground text-sm">いまは対応が必要な注文やメッセージはありません。</p>;
    return (
      <p className="text-muted-foreground text-sm">いま対応が必要な注文・メッセージ・在庫はありません。</p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {todoDefs.map((t) => {
        const n = todos[t.key];
        const hot = n > 0 && t.urgent;
        return (
          <Link
            key={t.key}
            href={t.href}
            className={cn(
              "bg-card flex flex-col gap-2 rounded-xl border p-4 transition-colors hover:border-primary/50",
              n === 0 && "opacity-60",
              hot && "border-destructive/40 bg-destructive/5",
            )}
          >
            <p className={cn("text-xs font-medium", hot ? "text-destructive" : "text-muted-foreground")}>{t.label}</p>
            <p className="num text-2xl font-semibold">
              {n}
              <span className="text-muted-foreground ml-0.5 text-xs font-normal">件</span>
            </p>
            <p className="text-muted-foreground text-[11px]">{t.hint}</p>
          </Link>
        );
      })}
    </div>
  );
}
