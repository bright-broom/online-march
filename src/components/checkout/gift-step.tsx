"use client";
import { Gift } from "lucide-react";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { giftLimits, noshiOptions } from "@/lib/validators/checkout";

export type GiftDraft = { wrapping: boolean; noshi: string; message: string };
const NO_NOSHI = "__none";

export function GiftStep({
  gift, onGift, note, onNote, errors,
}: {
  gift: GiftDraft;
  onGift: (patch: Partial<GiftDraft>) => void;
  note: string;
  onNote: (v: string) => void;
  errors: Record<string, string | undefined>;
}) {
  return (
    <FieldGroup className="gap-5">
      <Field orientation="horizontal" className="bg-muted/30 rounded-xl border p-4">
        <Gift className="text-primary mt-0.5 size-5 shrink-0" />
        <FieldContent>
          <FieldLabel htmlFor="gift-wrapping">ギフトとして贈る</FieldLabel>
          <FieldDescription>簡易ラッピングでお届けします。納品書に金額は記載されません。</FieldDescription>
        </FieldContent>
        <Switch id="gift-wrapping" checked={gift.wrapping} onCheckedChange={(v) => onGift({ wrapping: v })} />
      </Field>

      {gift.wrapping && (
        <div className="animate-fade-up grid gap-5 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <Field>
            <FieldLabel htmlFor="gift-noshi">のし</FieldLabel>
            <Select value={gift.noshi || NO_NOSHI} onValueChange={(v) => onGift({ noshi: v === NO_NOSHI ? "" : v })}>
              <SelectTrigger id="gift-noshi" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_NOSHI}>なし</SelectItem>
                {noshiOptions.map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field data-invalid={!!errors["gift.message"]}>
            <FieldLabel htmlFor="gift-message">メッセージカード（任意）</FieldLabel>
            <Textarea
              id="gift-message"
              rows={3}
              maxLength={giftLimits.messageMax}
              value={gift.message}
              onChange={(e) => onGift({ message: e.target.value })}
              placeholder="いつもありがとう。淡路島の新玉ねぎを贈ります。"
            />
            <FieldDescription className="text-right">{gift.message.length}/{giftLimits.messageMax}</FieldDescription>
            {errors["gift.message"] && <FieldError>{errors["gift.message"]}</FieldError>}
          </Field>
        </div>
      )}

      <Field data-invalid={!!errors.note}>
        <FieldLabel htmlFor="order-note">生産者へのご要望（任意）</FieldLabel>
        <Textarea
          id="order-note"
          rows={3}
          maxLength={giftLimits.noteMax}
          value={note}
          onChange={(e) => onNote(e.target.value)}
          placeholder="不在がちのため置き配希望、など"
        />
        {errors.note && <FieldError>{errors.note}</FieldError>}
      </Field>
    </FieldGroup>
  );
}
