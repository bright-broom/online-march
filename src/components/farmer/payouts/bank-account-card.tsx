"use client";
import { Landmark } from "lucide-react";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/common/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { bankAccountTypes, type BankAccountType } from "@/config/payments";
import { formatDate } from "@/lib/format";
import { saveFarmBankAccount } from "@/server/actions/farmer-shop";

export type BankAccountView = {
  bankName: string;
  bankCode: string;
  branchName: string;
  branchCode: string;
  accountType: string;
  accountNumberLast4: string;
  holderKana: string;
  updatedAt: Date;
};

type Result = Awaited<ReturnType<typeof saveFarmBankAccount>>;

/**
 * 振込先口座（#20）。Stripe を使わない農家には、運営がこの口座へ銀行振込する。
 * 口座番号は下4桁しか表示しない（変更するときは全桁を入れ直す）。
 */
export function BankAccountCard({ account, stripeOnboarded }: { account: BankAccountView | null; stripeOnboarded: boolean }) {
  const [editing, setEditing] = useState(!account);
  const [state, action] = useActionState<Result | null, FormData>(async (prev, fd) => {
    const res = await saveFarmBankAccount(prev, fd);
    if (res.ok) {
      toast.success(res.message ?? "保存しました");
      setEditing(false);
    } else toast.error(res.error);
    return res;
  }, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const typeLabel = (t: string) => bankAccountTypes[t as BankAccountType] ?? t;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Landmark className="size-4" />振込先口座（銀行振込）</CardTitle>
        <CardDescription>
          {stripeOnboarded
            ? "Stripe で受け取っているので登録は不要です。Stripe が使えなくなったときの予備として登録しておくこともできます。"
            : "Stripe を使わない場合は、この口座へ運営が銀行振込します。"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {account && !editing ? (
          <div className="space-y-3 text-sm">
            <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1.5">
              <dt className="text-muted-foreground">銀行</dt>
              <dd>{account.bankName}（{account.bankCode}）</dd>
              <dt className="text-muted-foreground">支店</dt>
              <dd>{account.branchName}（{account.branchCode}）</dd>
              <dt className="text-muted-foreground">口座</dt>
              <dd className="num">{typeLabel(account.accountType)} ＊＊＊{account.accountNumberLast4}</dd>
              <dt className="text-muted-foreground">名義</dt>
              <dd>{account.holderKana}</dd>
            </dl>
            <p className="text-muted-foreground text-xs">{formatDate(account.updatedAt)} に登録</p>
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setEditing(true)}>
              変更する
            </Button>
          </div>
        ) : (
          <form action={action} className="space-y-4">
            <FieldGroup className="grid gap-3 sm:grid-cols-[1fr_7rem]">
              <Field data-invalid={!!fe?.bankName}>
                <FieldLabel htmlFor="ba-bank">銀行名</FieldLabel>
                <Input id="ba-bank" name="bankName" defaultValue={account?.bankName} placeholder="淡路信用金庫" />
                {fe?.bankName && <FieldError>{fe.bankName[0]}</FieldError>}
              </Field>
              <Field data-invalid={!!fe?.bankCode}>
                <FieldLabel htmlFor="ba-bank-code">金融機関コード</FieldLabel>
                <Input id="ba-bank-code" name="bankCode" inputMode="numeric" maxLength={4} defaultValue={account?.bankCode} placeholder="0000" />
                {fe?.bankCode && <FieldError>{fe.bankCode[0]}</FieldError>}
              </Field>
              <Field data-invalid={!!fe?.branchName}>
                <FieldLabel htmlFor="ba-branch">支店名</FieldLabel>
                <Input id="ba-branch" name="branchName" defaultValue={account?.branchName} placeholder="南あわじ支店" />
                {fe?.branchName && <FieldError>{fe.branchName[0]}</FieldError>}
              </Field>
              <Field data-invalid={!!fe?.branchCode}>
                <FieldLabel htmlFor="ba-branch-code">支店コード</FieldLabel>
                <Input id="ba-branch-code" name="branchCode" inputMode="numeric" maxLength={3} defaultValue={account?.branchCode} placeholder="000" />
                {fe?.branchCode && <FieldError>{fe.branchCode[0]}</FieldError>}
              </Field>
              <Field data-invalid={!!fe?.accountType}>
                <FieldLabel htmlFor="ba-type">預金種目</FieldLabel>
                <Select name="accountType" defaultValue={account?.accountType ?? "ordinary"}>
                  <SelectTrigger id="ba-type" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(bankAccountTypes).map(([k, label]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field data-invalid={!!fe?.accountNumber}>
                <FieldLabel htmlFor="ba-number">口座番号</FieldLabel>
                <Input id="ba-number" name="accountNumber" inputMode="numeric" maxLength={7} autoComplete="off" placeholder="1234567" />
                {fe?.accountNumber && <FieldError>{fe.accountNumber[0]}</FieldError>}
              </Field>
              <Field data-invalid={!!fe?.holderKana} className="sm:col-span-2">
                <FieldLabel htmlFor="ba-holder">口座名義（カタカナ）</FieldLabel>
                <Input id="ba-holder" name="holderKana" defaultValue={account?.holderKana} placeholder="アワジ タロウ" />
                {fe?.holderKana ? <FieldError>{fe.holderKana[0]}</FieldError> : <FieldDescription>通帳に書かれている名義のとおりに入力してください。</FieldDescription>}
              </Field>
            </FieldGroup>
            <p className="text-muted-foreground text-xs leading-relaxed">
              口座番号は暗号化して保存し、画面には下4桁だけを表示します。運営は振込のときだけ全桁を確認します（確認した記録が残ります）。
            </p>
            <div className="flex gap-2">
              <SubmitButton className="rounded-full">保存する</SubmitButton>
              {account && <Button type="button" variant="ghost" onClick={() => setEditing(false)}>やめる</Button>}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
