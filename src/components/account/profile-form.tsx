"use client";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/common/submit-button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { updateProfile } from "@/server/actions/account";

type Result = Awaited<ReturnType<typeof updateProfile>>;

export function ProfileForm({ name, phone }: { name: string; phone: string | null }) {
  const router = useRouter();
  const [state, formAction] = useActionState<Result | null, FormData>(async (prev, fd) => {
    const res = await updateProfile(prev, fd);
    if (res.ok) {
      toast.success(res.message ?? "更新しました");
      // refresh Better Auth's cookie-cached session so the new name shows everywhere
      await authClient.getSession({ query: { disableCookieCache: true } });
      router.refresh();
    } else toast.error(res.error);
    return res;
  }, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={formAction} className="space-y-5">
      <FieldGroup className="gap-4">
        <Field data-invalid={!!fe?.name}>
          <FieldLabel htmlFor="profile-name">お名前</FieldLabel>
          <Input id="profile-name" name="name" defaultValue={name} autoComplete="name" maxLength={40} aria-invalid={!!fe?.name || undefined} />
          {fe?.name && <FieldError>{fe.name[0]}</FieldError>}
        </Field>
        <Field data-invalid={!!fe?.phone}>
          <FieldLabel htmlFor="profile-phone">電話番号（任意）</FieldLabel>
          <Input id="profile-phone" name="phone" type="tel" inputMode="tel" defaultValue={phone ?? ""} autoComplete="tel" placeholder="090-1234-5678" aria-invalid={!!fe?.phone || undefined} />
          {fe?.phone ? <FieldError>{fe.phone[0]}</FieldError> : <FieldDescription>配送に関するご連絡に使うことがあります。</FieldDescription>}
        </Field>
      </FieldGroup>
      <SubmitButton className="rounded-full">保存する</SubmitButton>
    </form>
  );
}
