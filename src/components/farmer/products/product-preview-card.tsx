import { ImageOff, Leaf } from "lucide-react";
import Image from "next/image";
import { Price } from "@/components/common/price";
import { Badge } from "@/components/ui/badge";
import { categories, cultivationMethods, type CultivationKey } from "@/config/catalog";
import type { ProductCategory } from "@/db/schema/marketplace";

export type ProductPreview = {
  name: string;
  summary: string;
  category: ProductCategory;
  variety: string;
  cultivation: string;
  image: string | null;
  imageCount: number;
  price: number | null;
  compareAt: number | null;
  variantLabel: string | null;
  variantCount: number;
  farmName: string;
  highlights: string[];
};

/** Live preview of the storefront product card (updates as the farmer types). */
export function ProductPreviewCard({ p }: { p: ProductPreview }) {
  const cult = cultivationMethods[p.cultivation as CultivationKey];
  return (
    <div className="bg-card overflow-hidden rounded-2xl border shadow-sm">
      <div className="bg-muted relative aspect-square">
        {p.image ? (
          <Image src={p.image} alt={p.name || "商品画像"} fill sizes="320px" className="object-cover" />
        ) : (
          <div className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs">
            <ImageOff className="size-6" />写真を追加するとここに表示されます
          </div>
        )}
        {p.imageCount > 1 && <span className="bg-background/80 absolute right-2 bottom-2 rounded-full px-2 py-0.5 text-[10px] backdrop-blur">1 / {p.imageCount}</span>}
        {p.compareAt && p.price && p.compareAt > p.price && (
          <Badge className="bg-onion-red text-sea-foreground absolute top-2 left-2 rounded-full">SALE</Badge>
        )}
      </div>
      <div className="space-y-2 p-4">
        <p className="text-muted-foreground text-[11px]">
          {categories[p.category].label}
          {p.variety && `・${p.variety}`}
        </p>
        <p className="heading-display line-clamp-2 text-base leading-snug">{p.name || "商品名"}</p>
        {p.summary && <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">{p.summary}</p>}
        {cult && (
          <span className="text-leaf inline-flex items-center gap-1 text-[11px] font-medium">
            <Leaf className="size-3" />
            {cult.label}
          </span>
        )}
        {p.highlights.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {p.highlights.slice(0, 3).map((h) => (
              <Badge key={h} variant="outline" className="rounded-full text-[10px] font-normal">{h}</Badge>
            ))}
          </div>
        )}
        <div className="flex items-end justify-between gap-2 pt-1">
          {p.price ? <Price amount={p.price} compareAt={p.compareAt} size="md" /> : <span className="text-muted-foreground text-sm">価格未設定</span>}
          {p.variantCount > 1 && <span className="text-muted-foreground text-[11px]">他{p.variantCount - 1}規格</span>}
        </div>
        {p.variantLabel && <p className="text-muted-foreground text-[11px]">{p.variantLabel}</p>}
        <p className="border-t pt-2 text-[11px]">{p.farmName}</p>
      </div>
    </div>
  );
}
