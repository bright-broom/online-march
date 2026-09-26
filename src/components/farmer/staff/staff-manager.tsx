"use client";
import { MailPlus, RefreshCw, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { ToneBadge } from "@/components/common/status-badge";
import { SubmitButton } from "@/components/common/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { farmAccessMeta, farmStaffPolicy } from "@/config/farm-staff";
import type { FarmMemberAccess } from "@/db/schema";
import { formatDate } from "@/lib/format";
import { changeStaffAccess, inviteStaff, removeStaff, resendStaffInvite } from "@/server/actions/farm-staff";
import type { FarmStaffRow } from "@/server/queries/farmer";
import { CopyButton } from "../copy-button";

const accesses: FarmMemberAccess[] = ["shipping", "all"];
type Result = Awaited<ReturnType<typeof inviteStaff>>;

/** 招待リンク（メールが届かないときに手で渡せるように、送った直後だけ出す） */
function InviteLink({ url }: { url: string }) {
  return (
    <div className="bg-muted/50 space-y-2 rounded-xl p-3 text-xs">
      <p>招待メールが届かないときは、このリンクを直接お渡しください（招待したアドレスのアカウントでだけ使えます）。</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate">{url}</code>
        <CopyButton text={url} label="リンクをコピー" />
      </div>
    </div>
  );
}

export function StaffManager({ rows, nowIso }: { rows: FarmStaffRow[]; nowIso: string }) {
  const now = new Date(nowIso).getTime();
  const [access, setAccess] = useState<FarmMemberAccess>("shipping");
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [state, formAction] = useActionState<Result | null, FormData>(async (prev, fd) => {
    const res = await inviteStaff(prev, fd);
    if (res.ok) {
      toast.success(res.message ?? "招待メールを送りました");
      setLink(res.data.url);
    } else toast.error(res.error);
    return res;
  }, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const full = rows.length >= farmStaffPolicy.maxMembers;

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string; data?: unknown }>, onOk?: (data: unknown) => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(res.message ?? "更新しました");
        onOk?.(res.data);
      } else toast.error(res.error);
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader>
          <CardTitle>スタッフ（{rows.length}/{farmStaffPolicy.maxMembers}人）</CardTitle>
          <CardDescription>外すと、次に画面を開いたときから生産者画面に入れなくなります。</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length ? (
            <ul className="divide-y">
              {rows.map((m) => {
                const expired = !m.acceptedAt && new Date(m.expiresAt).getTime() < now;
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{m.name ?? m.email}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {m.email}・
                        {m.acceptedAt ? `${formatDate(m.acceptedAt)} に参加` : expired ? "招待の期限切れ" : `招待中（${formatDate(m.expiresAt)} まで）`}
                      </p>
                    </div>
                    {!m.acceptedAt && <ToneBadge tone={expired ? "danger" : "warning"}>{expired ? "期限切れ" : "招待中"}</ToneBadge>}
                    <Select
                      value={m.access}
                      disabled={pending}
                      onValueChange={(v) => v !== m.access && run(() => changeStaffAccess({ memberId: m.id, access: v }))}
                    >
                      <SelectTrigger size="sm" className="w-28" aria-label={`${m.email} の権限`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {accesses.map((a) => <SelectItem key={a} value={a}>{farmAccessMeta[a].label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {!m.acceptedAt && (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => resendStaffInvite({ memberId: m.id }), (d) => setLink((d as { url: string }).url))}>
                        <RefreshCw />再送
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-destructive" disabled={pending} onClick={() => run(() => removeStaff({ memberId: m.id }))}>
                      <Trash2 />{m.acceptedAt ? "外す" : "取り消す"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-muted-foreground py-6 text-center text-sm">まだスタッフはいません。右のフォームから招待できます。</p>
          )}
          {link && <div className="mt-4"><InviteLink url={link} /></div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MailPlus className="size-4" />スタッフを招待</CardTitle>
          <CardDescription>ご家族やパートさんのメールアドレスに招待を送ります。そのアドレスで会員登録（無料）して参加します。</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <Field data-invalid={!!fe?.email}>
              <FieldLabel htmlFor="staff-email">メールアドレス</FieldLabel>
              <Input id="staff-email" name="email" type="email" autoComplete="off" required disabled={full} />
              {fe?.email && <FieldError>{fe.email[0]}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="staff-access">権限</FieldLabel>
              <input type="hidden" name="access" value={access} />
              <Select value={access} onValueChange={(v) => setAccess(v as FarmMemberAccess)} disabled={full}>
                <SelectTrigger id="staff-access"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {accesses.map((a) => <SelectItem key={a} value={a}>{farmAccessMeta[a].label}</SelectItem>)}
                </SelectContent>
              </Select>
              <FieldDescription>{farmAccessMeta[access].description}</FieldDescription>
            </Field>
            <SubmitButton className="w-full rounded-full" disabled={full}>{full ? `${farmStaffPolicy.maxMembers}人まで招待済みです` : "招待メールを送る"}</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
