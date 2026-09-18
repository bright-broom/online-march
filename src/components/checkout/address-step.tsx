"use client";
import { MapPinPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldLabel, FieldTitle } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { SavedAddress } from "@/server/queries/account";
import { AddressBlock } from "./address-block";
import { AddressFields, type AddressDraft } from "./address-fields";

export const NEW_ADDRESS = "new";

export function AddressStep({
  addresses, choice, onChoice, draft, onDraft, errors, save, onSave,
}: {
  addresses: SavedAddress[];
  choice: string;
  onChoice: (v: string) => void;
  draft: AddressDraft;
  onDraft: (patch: Partial<AddressDraft>) => void;
  errors: Record<string, string | undefined>;
  save: boolean;
  onSave: (v: boolean) => void;
}) {
  return (
    <div className="space-y-5">
      <RadioGroup value={choice} onValueChange={onChoice} className="grid gap-3 sm:grid-cols-2" aria-label="お届け先">
        {addresses.map((a) => (
          <FieldLabel key={a.id} htmlFor={`addr-opt-${a.id}`} className="cursor-pointer">
            <Field orientation="horizontal" className="items-start">
              <FieldContent className="gap-1.5">
                <FieldTitle className="flex flex-wrap items-center gap-2">
                  {a.label}
                  {a.isDefault && <Badge variant="secondary" className="rounded-full text-[10px]">いつもの</Badge>}
                </FieldTitle>
                <AddressBlock address={a} compact />
              </FieldContent>
              <RadioGroupItem value={a.id} id={`addr-opt-${a.id}`} className="mt-0.5" />
            </Field>
          </FieldLabel>
        ))}
        <FieldLabel htmlFor="addr-opt-new" className="cursor-pointer">
          <Field orientation="horizontal" className="items-start">
            <FieldContent className="gap-1.5">
              <FieldTitle className="flex items-center gap-2">
                <MapPinPlus className="text-primary size-4" />
                新しいお届け先
              </FieldTitle>
              <p className="text-muted-foreground text-xs">ご自宅以外やギフトの送り先はこちら</p>
            </FieldContent>
            <RadioGroupItem value={NEW_ADDRESS} id="addr-opt-new" className="mt-0.5" />
          </Field>
        </FieldLabel>
      </RadioGroup>

      {choice === NEW_ADDRESS && (
        <div className="bg-muted/30 animate-fade-up space-y-5 rounded-xl border p-4 sm:p-5">
          <AddressFields value={draft} onChange={onDraft} errors={errors} idPrefix="checkout-addr" />
          <Field orientation="horizontal">
            <Checkbox id="save-address" checked={save} onCheckedChange={(v) => onSave(v === true)} />
            <FieldLabel htmlFor="save-address" className="font-normal">このお届け先をアドレス帳に保存する</FieldLabel>
          </Field>
        </div>
      )}
    </div>
  );
}
