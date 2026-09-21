"use client";
import { ShoppingBag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Price } from "@/components/common/price";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { catalogLimits } from "@/config/catalog";
import { formatDate, formatWeight } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProductDetailDTO } from "@/server/queries/catalog";
import { useCart, useCartSheet } from "@/stores/cart";
import { QuantityStepper } from "../cart/quantity-stepper";
import { FavoriteButton } from "../favorite-button";
import { DeliveryEstimate } from "./delivery-estimate";

type Props = {
  product: Pick<ProductDetailDTO, "id" | "slug" | "name" | "variants" | "farm" | "status"> & { imageUrl: string | null };
  /** 農園がお休み中なら再開日（YYYY-MM-DD）。それ以外は null */
  pausedUntil?: string | null;
};

/** 端末のカレンダー上の日付（YYYY-MM-DD） */
const toYmdLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function stockNote(stock: number) {
  if (stock <= 0) return { label: "在庫なし", className: "text-muted-foreground" };
  if (stock <= catalogLimits.lowStockThreshold) return { label: `残り${stock}点`, className: "text-primary font-semibold" };
  return { label: "在庫あり", className: "text-leaf" };
}

/** Variant radio-cards, quantity, add-to-cart and a live delivery estimate. */
export function PurchasePanel({ product, pausedUntil }: Props) {
  const add = useCart((s) => s.add);
  const openCart = useCartSheet((s) => s.setOpen);
  const initial =
    product.variants.find((v) => v.isDefault && v.stock > 0) ?? product.variants.find((v) => v.stock > 0) ?? product.variants[0];
  const [variantId, setVariantId] = useState(initial?.id);
  const [qty, setQty] = useState(1);
  const variant = product.variants.find((v) => v.id === variantId) ?? initial;
  if (!variant) return null;

  // お休み中の農園は出荷できないので買えない（注文は server 側でも弾く）。
  // 判定はブラウザの日付で行う: ページはキャッシュされるので、サーバーで固めた「今日」は古くなりうる。
  const paused = Boolean(pausedUntil && pausedUntil >= toYmdLocal(new Date()));
  const soldOut = product.status === "soldout" || variant.stock <= 0;
  const unavailable = soldOut || paused;
  const quantity = Math.min(qty, Math.max(1, variant.stock));

  const onAdd = () => {
    if (unavailable) return;
    add(
      {
        variantId: variant.id,
        productId: product.id,
        productSlug: product.slug,
        productName: product.name,
        variantLabel: variant.label,
        farmId: product.farm.id,
        farmName: product.farm.name,
        farmSlug: product.farm.slug,
        imageUrl: product.imageUrl,
        unitPrice: variant.price,
        weightGrams: variant.weightGrams,
        maxQuantity: variant.stock,
        freeShippingThreshold: product.farm.freeShippingThreshold,
        leadTimeDays: product.farm.leadTimeDays,
        shipWeekdays: product.farm.shipWeekdays,
        carrier: product.farm.carrier,
      },
      quantity,
    );
    toast.success("カートに追加しました", {
      description: `${product.name}（${variant.label}）× ${quantity}`,
    });
    openCart(true);
  };

  return (
    <div className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="mb-3 text-sm font-semibold">内容量を選ぶ</legend>
        <RadioGroup
          value={variant.id}
          onValueChange={(id) => {
            setVariantId(id);
            setQty(1);
          }}
          aria-label="内容量"
          className="grid gap-2.5 sm:grid-cols-2"
        >
          {product.variants.map((v) => {
            const note = stockNote(product.status === "soldout" ? 0 : v.stock);
            return (
              <Label
                key={v.id}
                htmlFor={`variant-${v.id}`}
                className={cn(
                  "bg-card hover:border-foreground/25 has-data-checked:border-primary has-data-checked:bg-primary/5 has-data-checked:ring-primary has-[:focus-visible]:ring-ring/50 relative flex min-h-[4.5rem] cursor-pointer flex-col items-start gap-1 rounded-2xl border p-3.5 font-normal transition-all has-data-checked:ring-1 has-[:focus-visible]:ring-3",
                  v.stock <= 0 && "opacity-60",
                )}
              >
                <span className="flex w-full items-start justify-between gap-2">
                  <span className="text-sm font-medium">{v.label}</span>
                  <RadioGroupItem id={`variant-${v.id}`} value={v.id} className="mt-0.5" />
                </span>
                <Price amount={v.price} compareAt={v.compareAt} size="sm" showTax={false} />
                <span className="flex w-full items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">{formatWeight(v.weightGrams)}</span>
                  <span className={note.className}>{note.label}</span>
                </span>
              </Label>
            );
          })}
        </RadioGroup>
      </fieldset>

      <div className="flex items-end justify-between gap-4 border-y py-5">
        <div>
          <p className="text-muted-foreground mb-1 text-xs">お支払い金額（税込・送料別）</p>
          <Price amount={variant.price * quantity} compareAt={variant.compareAt ? variant.compareAt * quantity : null} size="xl" showTax={false} />
        </div>
        <QuantityStepper value={quantity} max={Math.max(1, variant.stock)} onChange={setQty} label={product.name} />
      </div>

      {paused && (
        <p className="bg-primary/5 border-primary/30 text-muted-foreground rounded-xl border px-3 py-2 text-xs leading-relaxed">
          {product.farm.name}は <span className="text-foreground font-medium">{formatDate(pausedUntil!)}</span> まで出荷をお休みしています。
          再開後にまたご注文いただけます。
        </p>
      )}

      <div className="flex gap-2.5">
        <Button onClick={onAdd} disabled={unavailable} className="h-12 flex-1 rounded-full text-base">
          <ShoppingBag className="size-5" />
          {paused ? "お休み中" : soldOut ? "売り切れ" : "カートに入れる"}
        </Button>
        <FavoriteButton productId={product.id} productName={product.name} variant="outline" />
      </div>

      <DeliveryEstimate subtotal={variant.price * quantity} weightGrams={variant.weightGrams * quantity} farm={product.farm} />
    </div>
  );
}
