"use client";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { AddressFields, emptyAddressDraft, type AddressDraft } from "@/components/checkout/address-fields";
import { SubmitButton } from "@/components/common/submit-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { saveAddress } from "@/server/actions/account";
import type { SavedAddress } from "@/server/queries/account";

type Result = Awaited<ReturnType<typeof saveAddress>>;
const labelPresets = ["自宅", "実家", "勤務先"];

export function AddressDialog({ address, trigger }: { address?: SavedAddress; trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AddressDraft>(() => (address ? { ...address } : emptyAddressDraft()));
  const [label, setLabel] = useState(address?.label ?? "自宅");
  const [isDefault, setIsDefault] = useState(address?.isDefault ?? false);
  const [state, formAction] = useActionState<Result | null, FormData>(async (prev, fd) => {
    const res = await saveAddress(prev, fd);
    if (res.ok) {
      toast.success(res.message ?? "保存しました");
      setOpen(false);
      if (!address) {
        setDraft(emptyAddressDraft());
        setLabel("自宅");
        setIsDefault(false);
      }
      router.refresh();
    } else toast.error(res.error);
    return res;
  }, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const errors = Object.fromEntries(Object.entries(fe ?? {}).map(([k, v]) => [k, v?.[0]]));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{address ? "お届け先を編集" : "お届け先を追加"}</DialogTitle>
          <DialogDescription>ご購入手続きでワンタップで選べるようになります。</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-5">
          {address && <input type="hidden" name="id" value={address.id} />}
          <Field data-invalid={!!errors.label}>
            <FieldLabel htmlFor="addr-label">呼び名</FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
              <ToggleGroup type="single" variant="outline" size="sm" value={labelPresets.includes(label) ? label : ""} onValueChange={(v) => v && setLabel(v)}>
                {labelPresets.map((l) => <ToggleGroupItem key={l} value={l}>{l}</ToggleGroupItem>)}
              </ToggleGroup>
              <Input id="addr-label" name="label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={20} className="w-36" />
            </div>
            {errors.label && <FieldError>{errors.label}</FieldError>}
          </Field>
          <AddressFields value={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} errors={errors} idPrefix={address ? `edit-${address.id}` : "new-addr"} />
          <Field orientation="horizontal">
            <Checkbox id={`default-${address?.id ?? "new"}`} name="isDefault" checked={isDefault} onCheckedChange={(v) => setIsDefault(v === true)} value="true" />
            <FieldLabel htmlFor={`default-${address?.id ?? "new"}`} className="font-normal">いつものお届け先に設定する</FieldLabel>
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>キャンセル</Button>
            <SubmitButton className="rounded-full">保存する</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
