"use client";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { catalogLimits, categories, categoryKeys, cultivationMethods, months } from "@/config/catalog";
import { routes } from "@/config/nav";
import { productStatusMeta } from "@/config/status";
import type { ProductCategory, ProductStatus } from "@/db/schema/marketplace";
import type { ActionResult } from "@/server/actions/_utils";
import { saveProduct } from "@/server/actions/farmer-products";
import { LazyImageUploader } from "../lazy";
import { StickySaveBar } from "../sticky-save-bar";
import { useUnsavedWarning } from "../use-unsaved-warning";
import { ProductPreviewCard } from "./product-preview-card";
import { TagInput } from "./tag-input";
import { VarietyCombobox } from "./variety-combobox";
import { emptyVariant, rowGrams, serializeVariants, toVariantRows, VariantsEditor, type VariantInitial, type VariantRow } from "./variants-editor";

export type ProductFormInitial = {
  id: string;
  slug: string;
  name: string;
  category: ProductCategory;
  variety: string;
  summary: string;
  description: string;
  highlights: string[];
  cultivation: string;
  storageTips: string;
  harvestFrom: number | null;
  harvestTo: number | null;
  status: ProductStatus;
  images: { url: string; alt: string }[];
  variants: VariantInitial[];
};

type FormState = {
  name: string;
  category: ProductCategory;
  variety: string;
  summary: string;
  description: string;
  highlights: string[];
  cultivation: string;
  storageTips: string;
  harvestFrom: string;
  harvestTo: string;
  status: ProductStatus;
  images: string[];
  variants: VariantRow[];
};

function initialState(p?: ProductFormInitial): FormState {
  return {
    name: p?.name ?? "",
    category: p?.category ?? categoryKeys[0],
    variety: p?.variety ?? "",
    summary: p?.summary ?? "",
    description: p?.description ?? "",
    highlights: p?.highlights ?? [],
    cultivation: p?.cultivation ?? Object.keys(cultivationMethods)[0],
    storageTips: p?.storageTips ?? "",
    harvestFrom: p?.harvestFrom ? String(p.harvestFrom) : "",
    harvestTo: p?.harvestTo ? String(p.harvestTo) : "",
    status: p?.status ?? "draft",
    images: p?.images.map((i) => i.url) ?? [],
    variants: p?.variants.length ? toVariantRows(p.variants) : [emptyVariant(5000, "init-0")],
  };
}

/** Everything that is submitted (used for dirty tracking). */
function payloadOf(s: FormState) {
  return JSON.stringify({ ...s, variants: serializeVariants(s.variants) });
}

const NONE = "none";

export function ProductForm({ product, farm }: { product?: ProductFormInitial; farm: { name: string; avatarImage: string | null } }) {
  const router = useRouter();
  const [s, setS] = useState(() => initialState(product));
  const [saved, setSaved] = useState(() => payloadOf(initialState(product)));
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setS((prev) => ({ ...prev, [k]: v }));
  const current = payloadOf(s);
  const dirty = current !== saved;
  useUnsavedWarning(dirty);

  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult<{ id: string; created: boolean }> | null, fd: FormData) => {
      const res = await saveProduct(prev, fd);
      if (res.ok) {
        setSaved(fd.get("__payload") as string);
        toast.success(res.message ?? "保存しました", { description: s.status === "active" ? "ストアに公開中です" : "下書きとして保存しました" });
        if (res.data.created) router.replace(routes.farmer.product(res.data.id));
        else router.refresh();
      } else {
        toast.error(res.error);
      }
      return res;
    },
    null,
  );
  const fe = (k: string) => (state && !state.ok ? state.fieldErrors?.[k]?.[0] : undefined);

  const preview = useMemo(() => {
    const v = serializeVariants(s.variants)[0];
    return {
      name: s.name, summary: s.summary, category: s.category, variety: s.variety, cultivation: s.cultivation,
      image: s.images[0] ?? null, imageCount: s.images.length,
      price: v?.price || null, compareAt: v?.compareAtPrice ?? null, variantLabel: v?.label || null, variantCount: s.variants.length,
      farmName: farm.name, highlights: s.highlights,
    };
  }, [s, farm.name]);

  const statusOptions: ProductStatus[] = s.status === "soldout" || s.status === "archived" ? ["draft", "active", s.status] : ["draft", "active"];
  const statusHelp: Partial<Record<ProductStatus, string>> = {
    draft: "ストアには表示されません。準備ができたら公開に切り替えましょう。",
    active: "ストアに表示され、すぐに購入できます。",
    soldout: "ストアに「売り切れ」として表示されます。",
    archived: "ストアから非表示になり、一覧でも隠れます。",
  };
  const totalStock = s.variants.reduce((a, r) => a + (Number.parseInt(r.stock, 10) || 0), 0);

  return (
    <form action={formAction} className="relative">
      {product && <input type="hidden" name="id" value={product.id} />}
      <input type="hidden" name="__payload" value={current} />
      <input type="hidden" name="category" value={s.category} />
      <input type="hidden" name="variety" value={s.variety} />
      <input type="hidden" name="highlights" value={JSON.stringify(s.highlights)} />
      <input type="hidden" name="cultivation" value={s.cultivation} />
      <input type="hidden" name="harvestFrom" value={s.harvestFrom} />
      <input type="hidden" name="harvestTo" value={s.harvestTo} />
      <input type="hidden" name="status" value={s.status} />
      <input type="hidden" name="images" value={JSON.stringify(s.images.map((url) => ({ url, alt: s.name })))} />
      <input type="hidden" name="variants" value={JSON.stringify(serializeVariants(s.variants))} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>写真</CardTitle>
              <CardDescription>1枚目がカバー写真になります。畑や収穫のようす、断面の写真があると伝わりやすくなります。</CardDescription>
            </CardHeader>
            <CardContent>
              <LazyImageUploader value={s.images} onChange={(v) => set("images", v)} max={catalogLimits.maxImagesPerProduct} folder="products" altText={s.name || "商品写真"} />
              {fe("images") && <p className="text-destructive mt-2 text-sm">{fe("images")}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>基本情報</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field data-invalid={!!fe("name") || undefined}>
                  <FieldLabel htmlFor="name">商品名</FieldLabel>
                  <Input id="name" name="name" value={s.name} onChange={(e) => set("name", e.target.value)} placeholder="例：吊り小屋熟成 淡路島たまねぎ（ターザン）" maxLength={80} aria-invalid={!!fe("name") || undefined} />
                  <FieldError>{fe("name")}</FieldError>
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field data-invalid={!!fe("category") || undefined}>
                    <FieldLabel htmlFor="category">カテゴリ</FieldLabel>
                    <Select value={s.category} onValueChange={(v) => set("category", v as ProductCategory)}>
                      <SelectTrigger id="category" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {categoryKeys.map((k) => <SelectItem key={k} value={k}>{categories[k].label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FieldDescription>{categories[s.category].description}</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="variety">品種</FieldLabel>
                    <VarietyCombobox id="variety" value={s.variety} onChange={(v) => set("variety", v)} />
                    <FieldDescription>リストにない品種は入力して追加できます</FieldDescription>
                  </Field>
                </div>
                <Field data-invalid={!!fe("summary") || undefined}>
                  <FieldLabel htmlFor="summary">ひとこと紹介</FieldLabel>
                  <Input id="summary" name="summary" value={s.summary} onChange={(e) => set("summary", e.target.value)} maxLength={120} placeholder="例：吊り小屋でひと夏じっくり乾かした、甘みの深い玉ねぎです" />
                  <FieldDescription className="flex justify-between"><span>一覧のカードに表示されます</span><span className="num">{s.summary.length}/120</span></FieldDescription>
                  <FieldError>{fe("summary")}</FieldError>
                </Field>
                <Field data-invalid={!!fe("description") || undefined}>
                  <FieldLabel htmlFor="description">商品説明</FieldLabel>
                  <Textarea id="description" name="description" rows={7} value={s.description} onChange={(e) => set("description", e.target.value)} maxLength={4000} placeholder="味の特徴、おすすめの食べ方、サイズや箱の中身など" />
                  <FieldDescription className="text-right"><span className="num">{s.description.length}/4000</span></FieldDescription>
                  <FieldError>{fe("description")}</FieldError>
                </Field>
                <Field data-invalid={!!fe("highlights") || undefined}>
                  <FieldLabel htmlFor="highlights">おすすめポイント（タグ）</FieldLabel>
                  <TagInput id="highlights" value={s.highlights} onChange={(v) => set("highlights", v)} placeholder="例：吊り小屋熟成　Enterで追加" />
                  <FieldError>{fe("highlights")}</FieldError>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>栽培と保存</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field data-invalid={!!fe("cultivation") || undefined}>
                  <FieldLabel>栽培方法</FieldLabel>
                  <RadioGroup value={s.cultivation} onValueChange={(v) => set("cultivation", v)} className="grid gap-2 sm:grid-cols-2">
                    {Object.entries(cultivationMethods).map(([k, m]) => (
                      <FieldLabel key={k} htmlFor={`cult-${k}`}>
                        <Field orientation="horizontal">
                          <FieldContent>
                            <FieldTitle>{m.label}</FieldTitle>
                            <FieldDescription className="text-xs">{m.description}</FieldDescription>
                          </FieldContent>
                          <RadioGroupItem value={k} id={`cult-${k}`} />
                        </Field>
                      </FieldLabel>
                    ))}
                  </RadioGroup>
                  <FieldError>{fe("cultivation")}</FieldError>
                </Field>
                <Field data-invalid={!!fe("harvestTo") || undefined}>
                  <FieldLabel>収穫・出荷時期</FieldLabel>
                  <div className="flex items-center gap-2">
                    <Select value={s.harvestFrom || NONE} onValueChange={(v) => set("harvestFrom", v === NONE ? "" : v)}>
                      <SelectTrigger className="w-28" aria-label="開始月"><SelectValue placeholder="開始" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>指定なし</SelectItem>
                        {months.map((m) => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground text-sm">〜</span>
                    <Select value={s.harvestTo || NONE} onValueChange={(v) => set("harvestTo", v === NONE ? "" : v)}>
                      <SelectTrigger className="w-28" aria-label="終了月"><SelectValue placeholder="終了" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>指定なし</SelectItem>
                        {months.map((m) => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <FieldDescription>ストアの「玉ねぎカレンダー」や旬の表示に使われます</FieldDescription>
                  <FieldError>{fe("harvestTo")}</FieldError>
                </Field>
                <Field data-invalid={!!fe("storageTips") || undefined}>
                  <FieldLabel htmlFor="storageTips">保存方法</FieldLabel>
                  <Textarea id="storageTips" name="storageTips" rows={3} value={s.storageTips} onChange={(e) => set("storageTips", e.target.value)} maxLength={1000} placeholder="例：ネットに入れて風通しのよい日陰に吊るすと長持ちします" />
                  <FieldError>{fe("storageTips")}</FieldError>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>規格・価格・在庫</CardTitle>
              <CardDescription>重量は送料の計算に使われます。箱のサイズの目安も自動で表示します。</CardDescription>
            </CardHeader>
            <CardContent>
              <VariantsEditor rows={s.variants} onChange={(v) => set("variants", v)} errors={fe} />
              {fe("variants") && <p className="text-destructive mt-2 text-sm">{fe("variants")}</p>}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>公開設定</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup value={s.status} onValueChange={(v) => set("status", v as ProductStatus)} className="gap-2">
                {statusOptions.map((st) => (
                  <FieldLabel key={st} htmlFor={`status-${st}`}>
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>{productStatusMeta[st].label}</FieldTitle>
                        <FieldDescription className="text-xs">{statusHelp[st]}</FieldDescription>
                      </FieldContent>
                      <RadioGroupItem value={st} id={`status-${st}`} />
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
              {s.status === "active" && totalStock === 0 && (
                <p className="text-destructive mt-3 text-xs">在庫が0のため、公開してもお客さまは購入できません。</p>
              )}
            </CardContent>
          </Card>
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium">ストアでの見え方</p>
            <ProductPreviewCard p={preview} />
            {(!s.variants[0] || rowGrams(s.variants[0]) === 0) && <p className="text-muted-foreground text-[11px]">重量を入れると送料が計算できるようになります</p>}
          </div>
        </aside>
      </div>

      <StickySaveBar dirty={dirty} pending={pending}>
        {product && product.status === "active" && (
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href={routes.product(product.slug)} target="_blank"><ExternalLink />ストアで見る</Link>
          </Button>
        )}
      </StickySaveBar>
    </form>
  );
}
