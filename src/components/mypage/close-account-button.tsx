"use client";
import { UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { routes } from "@/config/nav";
import { signOut } from "@/lib/auth-client";
import { closeAccount } from "@/server/actions/account";

/** 退会。取り消せないので、メールアドレスを打ち直してもらってから実行する。 */
export function CloseAccountButton({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase();

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTyped("");
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="text-destructive hover:text-destructive rounded-full">
          <UserX />退会する
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>退会しますか？</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>お名前・メールアドレス・お届け先・お気に入り・生産者とのメッセージを削除します。この操作は取り消せません。</p>
              <p className="text-muted-foreground text-xs">
                ご注文の記録は、生産者の帳簿と配送の記録として法令に従い保管します。投稿済みのレビューは「{"退会したお客さま"}」として残ります。
                配送中・お支払い待ちのご注文がある場合は退会できません。
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field>
          <FieldLabel htmlFor="close-confirm">確認のため、メールアドレスを入力してください</FieldLabel>
          <Input
            id="close-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={email}
            autoComplete="off"
            disabled={pending}
          />
          <FieldDescription>{email}</FieldDescription>
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>戻る</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={pending || !matches}
            onClick={() =>
              start(async () => {
                const res = await closeAccount({ confirmEmail: typed });
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                toast.success(res.message);
                await signOut();
                setOpen(false);
                router.push(routes.home);
                router.refresh();
              })
            }
          >
            {pending && <Spinner />}退会する
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
