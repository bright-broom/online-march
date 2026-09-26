"use client";
import { Ban, RotateCcw, UserX } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { userModerationCopy } from "@/config/content";
import { anonymizeUser, setUserSuspended } from "@/server/actions/admin-users";
import type { AdminUserRow } from "@/server/queries/admin";
import { ConfirmAction } from "../confirm-action";

/** 利用停止・再開・匿名化（#21）。自分自身・運営ユーザー・匿名化済みには出さない（サーバー側でも断る） */
export function UserModeration({ user, isSelf }: { user: AdminUserRow; isSelf: boolean }) {
  const [reason, setReason] = useState("");
  if (isSelf || user.role === "admin" || user.deletedAt) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {user.suspendedAt ? (
        <ConfirmAction
          trigger={<Button size="sm" variant="outline"><RotateCcw />再開</Button>}
          title="利用を再開しますか？"
          description={`${user.name}（${user.email}）がまたログインできるようになります。`}
          confirmLabel="再開する"
          action={() => setUserSuspended({ userId: user.id, suspended: false })}
        />
      ) : (
        <ConfirmAction
          trigger={<Button size="sm" variant="outline"><Ban />停止</Button>}
          title="利用を停止しますか？"
          description={
            <>
              {user.name}（{user.email}）はログインできなくなり、ログイン中の端末も切れます。注文・レビューはそのままで、進行中の注文は通常どおり発送されます。
              {user.role === "farmer" && " ショップは公開されたままです。ショップも止める場合は生産者の画面で出店を停止してください。"}
            </>
          }
          confirmLabel="停止する"
          destructive
          action={() => setUserSuspended({ userId: user.id, suspended: true, reason })}
        >
          <Field>
            <FieldLabel htmlFor={`suspend-reason-${user.id}`}>理由（運営のメモ・本人には表示しません）</FieldLabel>
            <Textarea id={`suspend-reason-${user.id}`} value={reason} maxLength={userModerationCopy.reasonMax} onChange={(e) => setReason(e.target.value)} rows={3} />
            <FieldDescription className="text-xs">操作記録に残ります。</FieldDescription>
          </Field>
        </ConfirmAction>
      )}
      {user.role === "customer" && (
        <ConfirmAction
          trigger={<Button size="sm" variant="ghost" className="text-destructive"><UserX />匿名化</Button>}
          title="このユーザーを匿名化しますか？"
          description={`${user.name}（${user.email}）の氏名・メール・電話・住所録・お気に入り・メッセージ・ログイン情報を消します。注文の記録とレビュー本文は残ります。取り消せません。進行中の注文がある間はできません。`}
          confirmLabel="匿名化する"
          destructive
          action={() => anonymizeUser({ userId: user.id })}
        />
      )}
    </div>
  );
}
