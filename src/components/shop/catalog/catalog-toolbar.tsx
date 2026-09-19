"use client";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { categories, cultivationMethods, priceRanges, productSortOptions, type ProductSort } from "@/config/catalog";
import { formatNumber } from "@/lib/format";
import { CatalogFilterPanel, useCatalogQuery, type CatalogFacets } from "./catalog-filters";
import { filterKeys } from "./catalog-params";

function ActiveFilterChips({ facets }: { facets: CatalogFacets }) {
  const [p, setParams] = useCatalogQuery();
  const chips: { key: (typeof filterKeys)[number]; label: string }[] = [];
  if (p.q) chips.push({ key: "q", label: `「${p.q}」` });
  if (p.category) chips.push({ key: "category", label: categories[p.category].label });
  if (p.farm) chips.push({ key: "farm", label: facets.farms.find((f) => f.slug === p.farm)?.name ?? p.farm });
  if (p.cultivation) chips.push({ key: "cultivation", label: cultivationMethods[p.cultivation].label });
  if (p.price) chips.push({ key: "price", label: priceRanges.find((r) => r.key === p.price)?.label ?? p.price });
  if (p.stock) chips.push({ key: "stock", label: "在庫あり" });
  if (!chips.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="適用中の条件">
      {chips.map((c) => (
        <li key={c.key}>
          <button
            type="button"
            onClick={() => setParams({ [c.key]: null, page: null })}
            className="bg-accent text-accent-foreground hover:bg-accent/70 focus-visible:ring-ring/50 inline-flex min-h-8 items-center gap-1 rounded-full py-1 pr-2 pl-3 text-xs transition-colors outline-none focus-visible:ring-3"
            aria-label={`${c.label} の条件を外す`}
          >
            {c.label}
            <X className="size-3.5 opacity-70" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function CatalogToolbar({ total, facets }: { total: number; facets: CatalogFacets }) {
  const [params, setParams] = useCatalogQuery();
  const activeCount = filterKeys.filter((k) => Boolean(params[k])).length;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm" aria-live="polite">
          <span className="num text-foreground text-lg font-semibold">{formatNumber(total)}</span>
          <span className="ml-1">件の商品</span>
        </p>
        <div className="flex items-center gap-2">
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="outline" className="h-10 rounded-full px-4 lg:hidden">
                <SlidersHorizontal />
                絞り込み
                {activeCount > 0 && (
                  <span className="bg-primary text-primary-foreground num flex size-5 items-center justify-center rounded-full text-[10px]">
                    {activeCount}
                  </span>
                )}
              </Button>
            </DrawerTrigger>
            <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[88svh]">
              <DrawerHeader className="text-left">
                <DrawerTitle className="heading-display text-lg">絞り込み</DrawerTitle>
                <DrawerDescription>条件を選ぶとすぐに結果が更新されます。</DrawerDescription>
              </DrawerHeader>
              <div className="overflow-y-auto overscroll-contain px-4 pb-2">
                <CatalogFilterPanel facets={facets} />
              </div>
              <DrawerFooter className="border-t">
                <DrawerClose asChild>
                  <Button className="h-12 rounded-full text-base">{formatNumber(total)}件の商品を見る</Button>
                </DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>

          <Select value={params.sort} onValueChange={(v) => setParams({ sort: v as ProductSort, page: null })}>
            <SelectTrigger aria-label="並び替え" className="bg-background h-10 rounded-full px-4">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {(Object.keys(productSortOptions) as ProductSort[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {productSortOptions[k].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <ActiveFilterChips facets={facets} />
    </div>
  );
}
