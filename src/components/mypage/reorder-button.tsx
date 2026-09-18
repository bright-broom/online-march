"use client";
import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/nav";
import type { ReorderItem } from "@/server/queries/account";
import { useCart } from "@/stores/cart";

/** Adds the purchasable items of a past order back to the cart (current prices / stock). */
export function ReorderButton({ items, skipped, size = "sm" }: { items: { item: ReorderItem; quantity: number }[]; skipped: number; size?: "sm" | "default" }) {
  const router = useRouter();
  const add = useCart((s) => s.add);
  if (!items.length) return null;
  return (
    <Button
      variant="outline"
      size={size}
      className="rounded-full"
      onClick={() => {
        for (const { item, quantity } of items) add(item, quantity);
        toast.success(`${items.length}点をカートに追加しました`, {
          description: skipped > 0 ? `販売終了・在庫切れの${skipped}点は追加できませんでした` : "価格は現在の販売価格です",
          action: { label: "カートを見る", onClick: () => router.push(routes.cart) },
        });
      }}
    >
      <RotateCcw />もう一度購入
    </Button>
  );
}
