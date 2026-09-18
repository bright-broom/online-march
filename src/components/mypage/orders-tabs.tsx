"use client";
import { Package } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { OrderListFilter, OrderListItem } from "@/server/queries/account";
import { OrderCard } from "./order-card";

const tabs: { value: OrderListFilter; label: string; empty: string }[] = [
  { value: "all", label: "すべて", empty: "まだご注文はありません" },
  { value: "active", label: "進行中", empty: "進行中のご注文はありません" },
  { value: "completed", label: "完了", empty: "お届けが完了したご注文はありません" },
  { value: "cancelled", label: "キャンセル", empty: "キャンセルしたご注文はありません" },
];

export function OrdersTabs({ orders }: { orders: OrderListItem[] }) {
  const byTab = (t: OrderListFilter) => (t === "all" ? orders : orders.filter((o) => o.group === t));
  return (
    <Tabs defaultValue="all" className="gap-4">
      <TabsList className="w-full sm:w-auto">
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
            {t.label}
            <span className="text-muted-foreground num text-[11px]">{byTab(t.value).length}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => {
        const list = byTab(t.value);
        return (
          <TabsContent key={t.value} value={t.value} className="space-y-3">
            {list.length ? (
              list.map((o) => <OrderCard key={o.id} order={o} />)
            ) : (
              <EmptyState icon={Package} title={t.empty} className="bg-card rounded-xl border" />
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
