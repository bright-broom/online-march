"use client";
import { Search, X } from "lucide-react";
import { useQueryStates } from "nuqs";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { categories, categoryKeys, cultivationMethods, priceRanges, type CultivationKey } from "@/config/catalog";
import { cn } from "@/lib/utils";
import { catalogParsers, filterKeys } from "./catalog-params";
import { useCatalogTransition } from "./catalog-pending";

export type CatalogFacets = { farms: { slug: string; name: string; count: number }[] };

/** URL-backed filter state. Non-shallow → the server re-renders the results. */
export function useCatalogQuery() {
  const { startTransition } = useCatalogTransition();
  return useQueryStates(catalogParsers, { shallow: false, scroll: false, startTransition });
}

const ALL = "__all";

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3 border-t pt-5 first:border-t-0 first:pt-0", className)}>
      <h3 className="text-foreground text-xs font-semibold tracking-wider">{title}</h3>
      {children}
    </section>
  );
}

function OptionList({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; count?: number }[];
}) {
  return (
    <RadioGroup value={value} onValueChange={onChange} className="gap-0.5" aria-label={name}>
      {options.map((o) => {
        const id = `${name}-${o.value}`;
        return (
          <Label
            key={o.value}
            htmlFor={id}
            className="hover:bg-muted has-data-checked:text-foreground text-muted-foreground flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm font-normal transition-colors lg:min-h-9"
          >
            <RadioGroupItem id={id} value={o.value} />
            <span className="flex-1">{o.label}</span>
            {o.count != null && <span className="num text-muted-foreground text-xs">{o.count}</span>}
          </Label>
        );
      })}
    </RadioGroup>
  );
}

function KeywordField({ initial, onSubmit }: { initial: string; onSubmit: (q: string) => void }) {
  const [q, setQ] = useState(initial);
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(q.trim());
      }}
    >
      <InputGroup className="h-10 rounded-full">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="品種・商品名・農家さん"
          aria-label="キーワード"
          enterKeyHint="search"
        />
        {q && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              aria-label="キーワードを消去"
              onClick={() => {
                setQ("");
                onSubmit("");
              }}
            >
              <X />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>
    </form>
  );
}

/** Filter controls (sidebar on desktop, drawer on mobile). */
export function CatalogFilterPanel({ facets, className }: { facets: CatalogFacets; className?: string }) {
  const [params, setParams] = useCatalogQuery();
  const hasFilters = filterKeys.some((k) => Boolean(params[k]));

  return (
    <div className={cn("space-y-5", className)}>
      <Section title="キーワード">
        <KeywordField key={params.q} initial={params.q} onSubmit={(q) => setParams({ q: q || null, page: null })} />
      </Section>

      <Section title="カテゴリ">
        <OptionList
          name="category"
          value={params.category ?? ALL}
          onChange={(v) => setParams({ category: v === ALL ? null : (v as (typeof categoryKeys)[number]), page: null })}
          options={[{ value: ALL, label: "すべて" }, ...categoryKeys.map((k) => ({ value: k, label: categories[k].label }))]}
        />
      </Section>

      {facets.farms.length > 0 && (
        <Section title="生産者">
          <div className={cn(facets.farms.length > 8 && "max-h-72 overflow-y-auto overscroll-contain pr-1")}>
            <OptionList
              name="farm"
              value={params.farm ?? ALL}
              onChange={(v) => setParams({ farm: v === ALL ? null : v, page: null })}
              options={[{ value: ALL, label: "すべての生産者" }, ...facets.farms.map((f) => ({ value: f.slug, label: f.name, count: f.count }))]}
            />
          </div>
        </Section>
      )}

      <Section title="栽培方法">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(cultivationMethods) as CultivationKey[]).map((k) => {
            const active = params.cultivation === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={active}
                title={cultivationMethods[k].description}
                onClick={() => setParams({ cultivation: active ? null : k, page: null })}
                className={cn(
                  "focus-visible:ring-ring/50 min-h-9 rounded-full border px-3 text-xs transition-colors outline-none focus-visible:ring-3",
                  active ? "border-primary bg-primary text-primary-foreground" : "hover:border-foreground/30 bg-background",
                )}
              >
                {cultivationMethods[k].label}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="価格帯">
        <OptionList
          name="price"
          value={params.price ?? ALL}
          onChange={(v) => setParams({ price: v === ALL ? null : (v as (typeof priceRanges)[number]["key"]), page: null })}
          options={[{ value: ALL, label: "指定なし" }, ...priceRanges.map((r) => ({ value: r.key, label: r.label }))]}
        />
      </Section>

      <Section title="在庫">
        <Label className="flex min-h-10 cursor-pointer items-center justify-between gap-3 text-sm font-normal">
          在庫ありのみ表示
          <Switch checked={params.stock} onCheckedChange={(v) => setParams({ stock: v || null, page: null })} />
        </Label>
      </Section>

      {hasFilters && (
        <Button
          variant="outline"
          className="h-10 w-full rounded-full"
          onClick={() => setParams({ q: null, category: null, farm: null, cultivation: null, price: null, stock: null, page: null })}
        >
          条件をすべてクリア
        </Button>
      )}
    </div>
  );
}

export function CatalogFilterSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-full rounded-full" />
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="space-y-2.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}
