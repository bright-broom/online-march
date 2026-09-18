"use client";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/common/submit-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cultivationMethods, type CultivationKey } from "@/config/catalog";
import { routes } from "@/config/nav";
import { prefectures, shippingPolicy } from "@/config/shipping";
import { submitFarmApplication } from "@/server/actions/join";

type State = Awaited<ReturnType<typeof submitFarmApplication>> | null;

function TextField({
  name,
  label,
  errors,
  description,
  ...props
}: React.ComponentProps<typeof Input> & { name: string; label: string; errors?: string[]; description?: string }) {
  return (
    <Field data-invalid={!!errors?.length}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input id={name} name={name} aria-invalid={!!errors?.length} className="h-11" {...props} />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError errors={errors?.map((message) => ({ message }))} />
    </Field>
  );
}

/** 出店申請フォーム. Values survive validation errors (no auto form reset: we submit via transition). */
export function JoinForm({ defaultRepresentative }: { defaultRepresentative: string }) {
  const [state, formAction] = useActionState<State, FormData>(submitFarmApplication, null);
  const [pending, startTransition] = useTransition();
  const topRef = useRef<HTMLDivElement>(null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;

  useEffect(() => {
    if (!state) return;
    if (state.ok) toast.success(state.message ?? "送信しました");
    else toast.error(state.error);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state]);

  if (state?.ok) {
    return (
      <div ref={topRef} className="bg-paper flex flex-col items-center gap-4 rounded-3xl px-6 py-14 text-center">
        <CheckCircle2 className="text-leaf size-12" />
        <h3 className="heading-display text-2xl">お申し込みありがとうございます</h3>
        <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
          「{state.data.farmName}」の出店申請を受け付けました。運営が内容を確認し、1〜3営業日以内にご連絡します。結果はマイページのお知らせでもご確認いただけます。
        </p>
        <Button asChild variant="outline" className="h-11 rounded-full px-6">
          <Link href={routes.mypage.notifications}>お知らせを見る</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="space-y-10"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <div ref={topRef} className="scroll-mt-28" />
      {state && !state.ok && (
        <p role="alert" className="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border px-4 py-3 text-sm">
          {state.error}
        </p>
      )}

      <FieldSet>
        <FieldLegend className="heading-display text-lg">農園について</FieldLegend>
        <FieldGroup className="grid gap-5 sm:grid-cols-2">
          <TextField name="farmName" label="農園名" placeholder="例）阿波ファーム" required maxLength={40} errors={fe?.farmName} />
          <TextField name="representative" label="代表者名" defaultValue={defaultRepresentative} autoComplete="name" required maxLength={40} errors={fe?.representative} />
          <div className="sm:col-span-2">
            <TextField name="tagline" label="ひとことで紹介" placeholder="例）三代つづく、吊り小屋熟成の玉ねぎ" required maxLength={40} errors={fe?.tagline} description="ショップページや商品カードに表示されます（40文字まで）" />
          </div>
          <Field data-invalid={!!fe?.story?.length} className="sm:col-span-2">
            <FieldLabel htmlFor="story">農園のストーリー</FieldLabel>
            <Textarea
              id="story"
              name="story"
              rows={6}
              required
              minLength={30}
              maxLength={2000}
              aria-invalid={!!fe?.story?.length}
              placeholder="栽培へのこだわり、畑のある場所、家族のことなど。お客さまが一番読んでくださる部分です。"
            />
            <FieldDescription>30〜2000文字。改行はそのまま表示されます。</FieldDescription>
            <FieldError errors={fe?.story?.map((message) => ({ message }))} />
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend className="heading-display text-lg">栽培方法</FieldLegend>
        <FieldDescription>該当するものをすべて選んでください（認証が必要なものは審査時に確認します）。</FieldDescription>
        <FieldGroup className="grid gap-2.5 sm:grid-cols-2">
          {(Object.keys(cultivationMethods) as CultivationKey[]).map((k) => (
            <FieldLabel key={k} htmlFor={`cm-${k}`}>
              <Field orientation="horizontal">
                <Checkbox id={`cm-${k}`} name="cultivationMethods[]" value={k} />
                <FieldContent>
                  <FieldTitle>{cultivationMethods[k].label}</FieldTitle>
                  <FieldDescription>{cultivationMethods[k].description}</FieldDescription>
                </FieldContent>
              </Field>
            </FieldLabel>
          ))}
        </FieldGroup>
        <FieldError errors={fe?.cultivationMethods?.map((message) => ({ message }))} />
      </FieldSet>

      <FieldSet>
        <FieldLegend className="heading-display text-lg">所在地・連絡先</FieldLegend>
        <FieldDescription>出荷元住所として送り状に使用します（一般には公開されません）。</FieldDescription>
        <FieldGroup className="grid gap-5 sm:grid-cols-2">
          <TextField name="postalCode" label="郵便番号" placeholder="656-0000" inputMode="numeric" autoComplete="postal-code" required errors={fe?.postalCode} />
          <Field data-invalid={!!fe?.prefecture?.length}>
            <FieldLabel htmlFor="prefecture">都道府県</FieldLabel>
            <Select name="prefecture" defaultValue={shippingPolicy.originPrefecture}>
              <SelectTrigger id="prefecture" className="h-11 w-full" aria-invalid={!!fe?.prefecture?.length}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="max-h-72">
                {prefectures.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError errors={fe?.prefecture?.map((message) => ({ message }))} />
          </Field>
          <TextField name="city" label="市区町村" placeholder="南あわじ市八木" autoComplete="address-level2" required errors={fe?.city} />
          <TextField name="addressLine" label="番地・建物名" autoComplete="address-line1" required errors={fe?.addressLine} />
          <TextField name="phone" label="電話番号" type="tel" placeholder="0799-00-0000" autoComplete="tel" required errors={fe?.phone} />
        </FieldGroup>
      </FieldSet>

      <div className="flex flex-col items-start gap-3 border-t pt-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-xs leading-relaxed">
          送信により<Link href={routes.legal.terms} className="text-primary hover:underline">利用規約</Link>
          に同意したものとみなします。
        </p>
        <SubmitButton pending={pending} className="h-12 w-full rounded-full px-8 text-base sm:w-auto">
          出店を申請する
        </SubmitButton>
      </div>
    </form>
  );
}
