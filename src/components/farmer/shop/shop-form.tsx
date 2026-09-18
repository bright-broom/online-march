"use client";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cultivationMethods } from "@/config/catalog";
import { routes } from "@/config/nav";
import type { ActionResult } from "@/server/actions/_utils";
import { saveShop } from "@/server/actions/farmer-shop";
import { LazyImageUploader } from "../lazy";
import { StickySaveBar } from "../sticky-save-bar";
import { useUnsavedWarning } from "../use-unsaved-warning";
import { FarmHeaderPreview } from "./farm-header-preview";

export type ShopFormInitial = {
  slug: string;
  name: string;
  tagline: string;
  story: string;
  representative: string;
  establishedYear: number | null;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine: string;
  phone: string;
  heroImage: string | null;
  avatarImage: string | null;
  gallery: string[];
  cultivationMethods: string[];
  isPublic: boolean;
};

const STORY_MAX = 2000;

export function ShopForm({ initial }: { initial: ShopFormInitial }) {
  const [s, setS] = useState(() => ({
    ...initial,
    establishedYear: initial.establishedYear ? String(initial.establishedYear) : "",
  }));
  const snapshot = (x: typeof s) => JSON.stringify(x);
  const [saved, setSaved] = useState(() => snapshot(s));
  const dirty = snapshot(s) !== saved;
  useUnsavedWarning(dirty);
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((p) => ({ ...p, [k]: v }));

  const [state, action, pending] = useActionState(async (prev: ActionResult | null, fd: FormData) => {
    const res = await saveShop(prev, fd);
    if (res.ok) {
      setSaved(fd.get("__snapshot") as string);
      toast.success(res.message ?? "保存しました");
    } else toast.error(res.error);
    return res;
  }, null);
  const fe = (k: string) => (state && !state.ok ? state.fieldErrors?.[k]?.[0] : undefined);

  const text = (k: "name" | "tagline" | "representative" | "postalCode" | "prefecture" | "city" | "addressLine" | "phone" | "establishedYear", label: string, opts: { placeholder?: string; inputMode?: "numeric" | "tel"; max?: number; description?: string } = {}) => (
    <Field data-invalid={!!fe(k) || undefined}>
      <FieldLabel htmlFor={k}>{label}</FieldLabel>
      <Input id={k} name={k} value={s[k]} onChange={(e) => set(k, e.target.value)} placeholder={opts.placeholder} inputMode={opts.inputMode} maxLength={opts.max} aria-invalid={!!fe(k) || undefined} />
      {opts.description && <FieldDescription>{opts.description}</FieldDescription>}
      <FieldError>{fe(k)}</FieldError>
    </Field>
  );

  return (
    <form action={action}>
      <input type="hidden" name="__snapshot" value={snapshot(s)} />
      <input type="hidden" name="story" value={s.story} />
      <input type="hidden" name="heroImage" value={s.heroImage ?? ""} />
      <input type="hidden" name="avatarImage" value={s.avatarImage ?? ""} />
      <input type="hidden" name="gallery" value={JSON.stringify(s.gallery)} />
      <input type="hidden" name="cultivationMethods" value={JSON.stringify(s.cultivationMethods)} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>写真</CardTitle>
              <CardDescription>トップ写真は畑や玉ねぎ小屋の風景がおすすめ。アイコンは顔写真やロゴを。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div className="space-y-2">
                  <p className="text-sm font-medium">トップ写真</p>
                  <LazyImageUploader value={s.heroImage ? [s.heroImage] : []} onChange={(v) => set("heroImage", v[0] ?? null)} max={1} folder="farms" aspect="wide" altText="トップ写真" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">アイコン</p>
                  <LazyImageUploader value={s.avatarImage ? [s.avatarImage] : []} onChange={(v) => set("avatarImage", v[0] ?? null)} max={1} folder="farms" maxDimension={800} altText="アイコン" />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">ギャラリー</p>
                <LazyImageUploader value={s.gallery} onChange={(v) => set("gallery", v)} max={12} folder="farms" coverLabel={false} altText="ギャラリー" />
                {fe("gallery") && <p className="text-destructive text-sm">{fe("gallery")}</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>農園のプロフィール</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                {text("name", "農園名", { max: 40 })}
                {text("tagline", "キャッチコピー", { max: 60, placeholder: "例：三代続く玉ねぎ小屋の甘さを、そのまま。", description: `${s.tagline.length}/60` })}
                <Field data-invalid={!!fe("story") || undefined}>
                  <FieldLabel htmlFor="story">農園のストーリー</FieldLabel>
                  <Textarea id="story" rows={8} value={s.story} maxLength={STORY_MAX} onChange={(e) => set("story", e.target.value)} placeholder="始めたきっかけ、畑のこと、こだわり、お客さまへのひとことなど" />
                  <FieldDescription className="flex justify-between">
                    <span>段落は空行で区切ると読みやすくなります</span>
                    <span className={s.story.length > STORY_MAX * 0.9 ? "text-primary num" : "num"}>{s.story.length}/{STORY_MAX}</span>
                  </FieldDescription>
                  <FieldError>{fe("story")}</FieldError>
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  {text("representative", "代表者名", { max: 40 })}
                  {text("establishedYear", "創業年（西暦）", { inputMode: "numeric", max: 4, placeholder: "1965" })}
                </div>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>栽培方法</CardTitle>
              <CardDescription>農園として取り組んでいるものをすべて選んでください</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(cultivationMethods).map(([k, m]) => {
                  const on = s.cultivationMethods.includes(k);
                  return (
                    <FieldLabel key={k} htmlFor={`cm-${k}`}>
                      <Field orientation="horizontal">
                        <Checkbox
                          id={`cm-${k}`}
                          checked={on}
                          onCheckedChange={(v) => set("cultivationMethods", v === true ? [...s.cultivationMethods, k] : s.cultivationMethods.filter((x) => x !== k))}
                        />
                        <FieldContent>
                          <FieldTitle>{m.label}</FieldTitle>
                          <FieldDescription className="text-xs">{m.description}</FieldDescription>
                        </FieldContent>
                      </Field>
                    </FieldLabel>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>所在地・連絡先</CardTitle>
              <CardDescription>送り状の「ご依頼主」と納品書の発送元に使われます。ストアには市区町村までを表示します。</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <div className="grid gap-5 sm:grid-cols-3">
                  {text("postalCode", "郵便番号", { inputMode: "numeric", max: 8, placeholder: "656-0000" })}
                  {text("prefecture", "都道府県", { max: 10 })}
                  {text("city", "市区町村", { max: 40 })}
                </div>
                {text("addressLine", "番地・建物名", { max: 120 })}
                {text("phone", "電話番号", { inputMode: "tel", max: 20, placeholder: "0799-00-0000", description: "配送業者からの連絡用。ストアには表示されません。" })}
              </FieldGroup>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <p className="text-muted-foreground text-xs font-medium">ストアでの見え方</p>
          <FarmHeaderPreview
            d={{
              name: s.name, tagline: s.tagline, representative: s.representative, city: s.city, establishedYear: s.establishedYear,
              heroImage: s.heroImage, avatarImage: s.avatarImage, cultivationMethods: s.cultivationMethods,
            }}
          />
          {s.story && <p className="text-muted-foreground line-clamp-4 text-xs leading-relaxed whitespace-pre-wrap">{s.story}</p>}
          {initial.isPublic && (
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href={routes.farm(initial.slug)} target="_blank"><ExternalLink />公開ページを見る</Link>
            </Button>
          )}
        </aside>
      </div>

      <StickySaveBar dirty={dirty} pending={pending} />
    </form>
  );
}
