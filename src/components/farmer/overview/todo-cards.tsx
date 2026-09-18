import { AlarmClock, ArrowRight, CircleCheck, ClipboardList, MessageCircle, PackageMinus, TriangleAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { routes } from "@/config/nav";
import { cn } from "@/lib/utils";
import type { FarmTodos } from "@/server/queries/farmer";

type Todo = { key: keyof FarmTodos; label: string; hint: string; href: string; icon: LucideIcon; urgent?: boolean };

const todoDefs: Todo[] = [
  { key: "overdue", label: "期限超過", hint: "出荷期限を過ぎた注文", href: routes.farmer.shipping, icon: TriangleAlert, urgent: true },
  { key: "dueToday", label: "本日出荷期限", hint: "今日中に発送", href: routes.farmer.shipping, icon: AlarmClock, urgent: true },
  { key: "newOrders", label: "新規受注", hint: "出荷準備を始めましょう", href: `${routes.farmer.orders}?tab=paid`, icon: ClipboardList },
  { key: "unreadMessages", label: "未読メッセージ", hint: "お客さまからの連絡", href: routes.farmer.messages, icon: MessageCircle },
  { key: "lowStock", label: "在庫わずか", hint: "規格の在庫を補充", href: `${routes.farmer.products}?status=active`, icon: PackageMinus },
];

/** Today's to-dos as tappable action cards. */
export function TodoCards({ todos }: { todos: FarmTodos }) {
  const active = todoDefs.filter((t) => todos[t.key] > 0);
  if (!active.length) {
    return (
      <div className="bg-leaf/10 text-foreground flex items-center gap-3 rounded-xl border border-leaf/25 p-4">
        <CircleCheck className="text-leaf size-5 shrink-0" />
        <p className="text-sm">今日のやることはすべて完了しています。畑仕事におもどりください。</p>
      </div>
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
              "group bg-card flex flex-col gap-2 rounded-xl border p-4 transition-colors hover:border-primary/50",
              n === 0 && "opacity-60",
              hot && "border-destructive/40 bg-destructive/5",
            )}
          >
            <div className="flex items-center justify-between">
              <span className={cn("rounded-lg p-1.5", hot ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
                <t.icon className="size-4" />
              </span>
              <ArrowRight className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="text-muted-foreground text-xs font-medium">{t.label}</p>
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
