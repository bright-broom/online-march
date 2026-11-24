"use client";
import { useRef, useState } from "react";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { prefectures } from "@/config/shipping";
import { findAddressByPostalCode } from "@/server/actions/postal";

const digitsOf = (v: string) => v.normalize("NFKC").replace(/[^0-9]/g, "");

export type AddressDraft = {
  recipientName: string;
  recipientKana: string;
  postalCode: string;
  prefecture: string;
  city: string;
  line1: string;
  line2: string;
  phone: string;
};

export const emptyAddressDraft = (name = ""): AddressDraft => ({
  recipientName: name, recipientKana: "", postalCode: "", prefecture: "", city: "", line1: "", line2: "", phone: "",
});

/**
 * Controlled Japanese address fields. Inputs carry `name` attributes so they also work inside a
 * <form action> (FormData). `idPrefix` keeps ids unique when rendered twice on a page.
 */
export function AddressFields({
  value, onChange, errors = {}, idPrefix = "addr",
}: {
  value: AddressDraft;
  onChange: (patch: Partial<AddressDraft>) => void;
  errors?: Record<string, string | undefined>;
  idPrefix?: string;
}) {
  const id = (k: string) => `${idPrefix}-${k}`;
  // 郵便番号が7桁そろったら住所を引いて、都道府県と市区町村を埋める（引けなくても手で入れられる）。
  // 自分で書き換えた市区町村は上書きしない: 前回自動で入れた値か空のときだけ入れ替える
  const autofilled = useRef<string | null>(null);
  const looked = useRef<string | null>(null);
  const [filledFrom, setFilledFrom] = useState<string | null>(null);
  const onPostalChange = async (raw: string) => {
    onChange({ postalCode: raw });
    const zip = digitsOf(raw);
    if (zip.length !== 7 || zip === looked.current) return;
    looked.current = zip;
    const res = await findAddressByPostalCode({ postalCode: zip });
    if (!res.ok || !res.data || looked.current !== zip) return;
    const city = `${res.data.city}${res.data.town}`;
    const patch: Partial<AddressDraft> = { prefecture: res.data.prefecture };
    if (!value.city || value.city === autofilled.current) patch.city = city;
    autofilled.current = patch.city ?? autofilled.current;
    onChange(patch);
    setFilledFrom(zip);
  };
  const text = (k: keyof AddressDraft) => ({
    id: id(k),
    name: k,
    value: value[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange({ [k]: e.target.value }),
    "aria-invalid": !!errors[k] || undefined,
  });
  return (
    <FieldGroup className="gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field data-invalid={!!errors.recipientName}>
          <FieldLabel htmlFor={id("recipientName")}>お名前</FieldLabel>
          <Input {...text("recipientName")} autoComplete="name" placeholder="淡路 花子" />
          {errors.recipientName && <FieldError>{errors.recipientName}</FieldError>}
        </Field>
        <Field data-invalid={!!errors.recipientKana}>
          <FieldLabel htmlFor={id("recipientKana")}>フリガナ</FieldLabel>
          <Input {...text("recipientKana")} placeholder="アワジ ハナコ" />
          {errors.recipientKana && <FieldError>{errors.recipientKana}</FieldError>}
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <Field data-invalid={!!errors.postalCode}>
          <FieldLabel htmlFor={id("postalCode")}>郵便番号</FieldLabel>
          <Input
            {...text("postalCode")}
            onChange={(e) => void onPostalChange(e.target.value)}
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="656-0000"
            maxLength={8}
          />
          {errors.postalCode ? (
            <FieldError>{errors.postalCode}</FieldError>
          ) : (
            filledFrom === digitsOf(value.postalCode) && (
              <FieldDescription className="text-xs" aria-live="polite">住所を入れました。番地から続けてください</FieldDescription>
            )
          )}
        </Field>
        <Field data-invalid={!!errors.prefecture}>
          <FieldLabel htmlFor={id("prefecture")}>都道府県</FieldLabel>
          <Select name="prefecture" value={value.prefecture} onValueChange={(v) => onChange({ prefecture: v })}>
            <SelectTrigger id={id("prefecture")} className="w-full" aria-invalid={!!errors.prefecture || undefined}>
              <SelectValue placeholder="選択してください" />
            </SelectTrigger>
            <SelectContent className="max-h-[min(20rem,var(--radix-select-content-available-height))]">
              {prefectures.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.prefecture && <FieldError>{errors.prefecture}</FieldError>}
        </Field>
      </div>
      <Field data-invalid={!!errors.city}>
        <FieldLabel htmlFor={id("city")}>市区町村</FieldLabel>
        <Input {...text("city")} autoComplete="address-level2" placeholder="南あわじ市" />
        {errors.city && <FieldError>{errors.city}</FieldError>}
      </Field>
      <Field data-invalid={!!errors.line1}>
        <FieldLabel htmlFor={id("line1")}>番地</FieldLabel>
        <Input {...text("line1")} autoComplete="address-line1" placeholder="市1-2-3" />
        {errors.line1 && <FieldError>{errors.line1}</FieldError>}
      </Field>
      <Field data-invalid={!!errors.line2}>
        <FieldLabel htmlFor={id("line2")}>建物名・部屋番号（任意）</FieldLabel>
        <Input {...text("line2")} autoComplete="address-line2" placeholder="マルシェハイツ 101" />
        {errors.line2 && <FieldError>{errors.line2}</FieldError>}
      </Field>
      <Field data-invalid={!!errors.phone}>
        <FieldLabel htmlFor={id("phone")}>電話番号</FieldLabel>
        <Input {...text("phone")} type="tel" inputMode="tel" autoComplete="tel" placeholder="090-1234-5678" />
        {errors.phone && <FieldError>{errors.phone}</FieldError>}
      </Field>
    </FieldGroup>
  );
}
