"use client";
import { BadgeCheck, CircleAlert, MailCheck } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { authErrorMessage } from "@/components/auth/auth-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

const DONE_PARAM = "email";

/**
 * メールアドレスの確認と変更（#16）。変更は新しいアドレスに届いたリンクを開いたときに行われるので、
 * 打ち間違えたアドレスに切り替わってしまうことはない。確認・変更のリンクはこのページに戻ってくる。
 */
export function EmailSettings({ email, emailVerified }: { email: string; emailVerified: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const callbackURL = `${pathname}?${DONE_PARAM}=done`;

  // back from the link in the email: Better Auth appends ?error=… when the token was bad or expired
  useEffect(() => {
    const failed = params.get("error");
    const done = params.get(DONE_PARAM);
    if (!failed && !done) return;
    if (failed) toast.error(authErrorMessage({ code: failed }));
    else toast.success("メールアドレスを確認しました");
    router.replace(pathname, { scroll: false });
    router.refresh();
  }, [params, pathname, router]);

  const sendVerification = () =>
    startTransition(async () => {
      const { error: e } = await authClient.sendVerificationEmail({ email, callbackURL });
      if (e) toast.error(authErrorMessage(e));
      else toast.success(`${email} に確認メールを送りました`);
    });

  const change = () =>
    startTransition(async () => {
      const next = newEmail.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) return setError("メールアドレスの形式が正しくありません。");
      if (next === email.toLowerCase()) return setError("いまと同じメールアドレスです。");
      setError(null);
      const { error: e } = await authClient.changeEmail({ newEmail: next, callbackURL });
      if (e) return setError(authErrorMessage(e));
      setSentTo(next);
      setEditing(false);
      setNewEmail("");
    });

  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor="profile-email">メールアドレス</FieldLabel>
      <div className="flex flex-wrap items-center gap-2">
        <span id="profile-email" className="text-sm font-medium break-all">{email}</span>
        {emailVerified ? (
          <Badge variant="secondary"><BadgeCheck />確認済み</Badge>
        ) : (
          <Badge variant="outline" className="text-destructive"><CircleAlert />未確認</Badge>
        )}
      </div>
      <FieldDescription>ログインと、注文確認・パスワード再設定のメールに使われます。</FieldDescription>
      {!emailVerified && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          このアドレスにメールが届くか、まだ確認できていません。届いたメールのボタンを押してください。
          アドレスが間違っているときは「変更する」から直せます。
        </p>
      )}
      {sentTo && (
        <p role="status" className="bg-muted flex gap-2 rounded-lg p-3 text-xs leading-relaxed">
          <MailCheck className="text-leaf size-4 shrink-0" />
          {sentTo} に確認メールを送りました。メールのボタンを押すと、メールアドレスが変更されます（24時間有効）。
        </p>
      )}
      {editing ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="email"
            autoComplete="email"
            placeholder="新しいメールアドレス"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            aria-invalid={!!error || undefined}
            aria-label="新しいメールアドレス"
          />
          <div className="flex gap-2">
            <Button type="button" onClick={change} disabled={pending} className="rounded-full">
              {pending && <Spinner />}確認メールを送る
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setEditing(false); setError(null); }} disabled={pending}>
              やめる
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setEditing(true)}>
            変更する
          </Button>
          {!emailVerified && (
            <Button type="button" variant="ghost" size="sm" onClick={sendVerification} disabled={pending}>
              {pending && <Spinner />}確認メールを再送する
            </Button>
          )}
        </div>
      )}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}
