"use client";
import { ArrowDown, ArrowUp, Box, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { catalogLimits, comparePricePolicy } from "@/config/catalog";
import { formatWeight } from "@/lib/format";
import { packBoxes } from "@/lib/shipping";
import { cn } from "@/lib/utils";

export type VariantRow = {
  key: string;
  id?: string;
  label: string;
  weight: string;
  unit: "kg" | "g";
  price: string;
  compareAtPrice: string;
  stock: string;
  /** 編集画面を開いた時点の在庫（既存の規格のみ）。保存では差分だけを反映する（開いている間に売れた分を消さない） */
  stockBase?: number;
  sku: string;
  /** 保存済みの通常価格を、お客さまに打ち消し表示しているか（#11）。編集中の値ではなく、保存した時点の判定 */
  compareAtNote?: { shown: boolean; message: string } | null;
};

export type VariantInitial = {
  id?: string;
  label: string;
  weightGrams: number;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  sku: string;
  compareAtNote?: { shown: boolean; message: string } | null;
};

/** Row keys: deterministic for SSR'd initial rows (ids feed input `id`s), counter for rows added on the client. */
let seq = 0;
const newKey = () => `new-${(seq++).toString(36)}`;

export function toVariantRows(list: VariantInitial[]): VariantRow[] {
  return list.map((v, i) => {
    const kg = v.weightGrams >= 1000 && v.weightGrams % 100 === 0;
    return {
      key: v.id ?? `init-${i}`,
      id: v.id,
      label: v.label,
      weight: kg ? String(v.weightGrams / 1000) : String(v.weightGrams),
      unit: kg ? "kg" : "g",
      price: String(v.price),
      compareAtPrice: v.compareAtPrice != null ? String(v.compareAtPrice) : "",
      stock: String(v.stock),
      stockBase: v.id ? v.stock : undefined,
      sku: v.sku,
      compareAtNote: v.compareAtNote ?? null,
    };
  });
}

export const rowGrams = (r: VariantRow) => {
  const n = Number.parseFloat(r.weight);
  return Number.isFinite(n) ? Math.round(n * (r.unit === "kg" ? 1000 : 1)) : 0;
};
const intOf = (s: string) => {
  const n = Number.parseInt(s.replace(/[,，]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
};

/** Shape sent to the server (validated again by productFormSchema). */
export function serializeVariants(rows: VariantRow[]) {
  return rows.map((r) => ({
    id: r.id,
    label: r.label.trim() || (rowGrams(r) ? formatWeight(rowGrams(r)) : ""),
    weightGrams: rowGrams(r),
    price: intOf(r.price),
    compareAtPrice: r.compareAtPrice.trim() ? intOf(r.compareAtPrice) : null,
    stock: intOf(r.stock),
    stockBase: r.id ? r.stockBase : undefined,
    sku: r.sku.trim(),
  }));
}

export function emptyVariant(grams?: number, key = newKey()): VariantRow {
  const kg = grams != null && grams >= 1000;
  return { key, label: grams ? formatWeight(grams) : "", weight: grams ? String(kg ? grams / 1000 : grams) : "", unit: kg || grams == null ? "kg" : "g", price: "", compareAtPrice: "", stock: "", sku: "" };
}

/** よく使う規格（ワンタップで追加） */
const quickWeights = [2000, 3000, 5000, 10000, 20000];

export function VariantsEditor({
  rows, onChange, errors,
}: { rows: VariantRow[]; onChange: (rows: VariantRow[]) => void; errors: (key: string) => string | undefined }) {
  const max = catalogLimits.maxVariantsPerProduct;
  const update = (i: number, patch: Partial<VariantRow>) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {rows.map((r, i) => {
        const grams = rowGrams(r);
        const box = grams > 0 ? packBoxes(grams) : null;
        const err = (f: string) => errors(`variants.${i}.${f}`);
        return (
          <fieldset key={r.key} className={cn("bg-muted/30 rounded-xl border p-3 sm:p-4", i === 0 && "border-primary/30")}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <legend className="text-sm font-medium">
                規格 {i + 1}
                {i === 0 && <span className="text-primary ml-2 text-xs">（おすすめ表示）</span>}
              </legend>
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => move(i, -1)} disabled={i === 0} aria-label="上へ">
                  <ArrowUp />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="下へ">
                  <ArrowDown />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="text-destructive size-8" onClick={() => onChange(rows.filter((_, idx) => idx !== i))} disabled={rows.length <= 1} aria-label="この規格を削除">
                  <Trash2 />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              <Field className="col-span-2 lg:col-span-2" data-invalid={!!err("label") || undefined}>
                <FieldLabel htmlFor={`${r.key}-label`}>規格名</FieldLabel>
                <Input id={`${r.key}-label`} value={r.label} placeholder={grams ? formatWeight(grams) : "例：5kg 箱（L・2L混合）"} onChange={(e) => update(i, { label: e.target.value })} aria-invalid={!!err("label") || undefined} />
                <FieldError>{err("label")}</FieldError>
              </Field>
              <Field data-invalid={!!err("weightGrams") || undefined}>
                <FieldLabel htmlFor={`${r.key}-weight`}>重量</FieldLabel>
                <div className="flex gap-1.5">
                  <Input id={`${r.key}-weight`} inputMode="decimal" value={r.weight} onChange={(e) => update(i, { weight: e.target.value })} aria-invalid={!!err("weightGrams") || undefined} className="min-w-0" />
                  <Select value={r.unit} onValueChange={(v) => update(i, { unit: v as VariantRow["unit"] })}>
                    <SelectTrigger className="w-18 shrink-0" aria-label="単位"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="g">g</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <FieldError>{err("weightGrams")}</FieldError>
              </Field>
              <Field data-invalid={!!err("price") || undefined}>
                <FieldLabel htmlFor={`${r.key}-price`}>販売価格（税込）</FieldLabel>
                <InputGroup>
                  <InputGroupInput id={`${r.key}-price`} inputMode="numeric" value={r.price} onChange={(e) => update(i, { price: e.target.value })} aria-invalid={!!err("price") || undefined} />
                  <InputGroupAddon align="inline-end"><InputGroupText>円</InputGroupText></InputGroupAddon>
                </InputGroup>
                <FieldError>{err("price")}</FieldError>
              </Field>
              <Field data-invalid={!!err("compareAtPrice") || undefined}>
                <FieldLabel htmlFor={`${r.key}-compare`}>通常価格（任意）</FieldLabel>
                <InputGroup>
                  <InputGroupInput id={`${r.key}-compare`} inputMode="numeric" value={r.compareAtPrice} placeholder="セール時のみ" onChange={(e) => update(i, { compareAtPrice: e.target.value })} aria-invalid={!!err("compareAtPrice") || undefined} />
                  <InputGroupAddon align="inline-end"><InputGroupText>円</InputGroupText></InputGroupAddon>
                </InputGroup>
                <FieldError>{err("compareAtPrice")}</FieldError>
                {r.compareAtNote ? (
                  <FieldDescription className={r.compareAtNote.shown ? "text-xs" : "text-xs text-amber-800 dark:text-amber-300"}>{r.compareAtNote.message}</FieldDescription>
                ) : (
                  <FieldDescription className="text-xs">{comparePricePolicy.hint}</FieldDescription>
                )}
              </Field>
              <Field data-invalid={!!err("stock") || undefined}>
                <FieldLabel htmlFor={`${r.key}-stock`}>在庫</FieldLabel>
                <InputGroup>
                  <InputGroupInput id={`${r.key}-stock`} inputMode="numeric" value={r.stock} onChange={(e) => update(i, { stock: e.target.value })} aria-invalid={!!err("stock") || undefined} />
                  <InputGroupAddon align="inline-end"><InputGroupText>点</InputGroupText></InputGroupAddon>
                </InputGroup>
                <FieldError>{err("stock")}</FieldError>
              </Field>
              <Field className="col-span-2 lg:col-span-2">
                <FieldLabel htmlFor={`${r.key}-sku`}>管理番号（任意）</FieldLabel>
                <Input id={`${r.key}-sku`} value={r.sku} onChange={(e) => update(i, { sku: e.target.value })} placeholder="SKU" />
              </Field>
              {box && (
                <p className="text-muted-foreground col-span-2 flex items-center gap-1.5 self-end pb-2 text-xs lg:col-span-4">
                  <Box className="size-3.5" />
                  梱包の目安：{box.size}サイズ × {box.count}箱（梱包材込み {formatWeight(box.perBoxGrams)}/箱）
                </p>
              )}
            </div>
          </fieldset>
        );
      })}

      {rows.length < max && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, emptyVariant()])}>
            <Plus />規格を追加
          </Button>
          <span className="text-muted-foreground text-xs">よく使う規格：</span>
          {quickWeights.map((g) => (
            <Button key={g} type="button" variant="secondary" size="sm" className="h-7 rounded-full px-2.5 text-xs" onClick={() => onChange([...rows, emptyVariant(g)])}>
              +{formatWeight(g)}
            </Button>
          ))}
        </div>
      )}
      <p className="text-muted-foreground text-xs">
        規格は{max}個まで。1つ目がストアで最初に表示されます。在庫が{catalogLimits.lowStockThreshold}点以下になると「在庫わずか」としてお知らせします。
      </p>
    </div>
  );
}
