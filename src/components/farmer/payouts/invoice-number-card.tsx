"use client";
import { ReceiptText } from "lucide-react";
import { useActionState } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/common/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { saveFarmInvoiceNumber } from "@/server/actions/farmer-shop";

type Result = Awaited<ReturnType<typeof saveFarmInvoiceNumber>>;

/** 生産者の適格請求書発行事業者の登録番号（#10, 任意）。今は保存するだけで、領収書などには使わない（売主の決定待ち） */
export function InvoiceNumberCard({ value }: { value: string | null }) {
  const [state, action] = useActionState<Result | null, FormData>(async (prev, fd) => {
    const res = await saveFarmInvoiceNumber(prev, fd);
    if (res.ok) toast.success(res.message ?? "保存しました");
    else toast.error(res.error);
    return res;
  }, null);
  const err = state && !state.ok ? state.fieldErrors?.invoiceRegistrationNumber?.[0] : undefined;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><ReceiptText className="size-4" />インボイスの登録番号（任意）</CardTitle>
        <CardDescription>適格請求書発行事業者として登録している場合に入力してください。登録していなくても出店・精算はできます。</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-wrap items-end gap-3">
          <Field data-invalid={!!err} className="w-56">
            <FieldLabel htmlFor="invoice-number">登録番号</FieldLabel>
            <Input id="invoice-number" name="invoiceRegistrationNumber" defaultValue={value ?? ""} placeholder="T1234567890123" maxLength={20} autoComplete="off" />
            {err && <FieldError>{err}</FieldError>}
          </Field>
          <SubmitButton className="rounded-full">保存</SubmitButton>
          <FieldDescription className="w-full text-xs">空にして保存すると削除します。</FieldDescription>
        </form>
      </CardContent>
    </Card>
  );
}
