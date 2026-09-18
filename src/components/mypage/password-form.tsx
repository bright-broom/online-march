"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { authErrorMessage } from "@/components/auth/auth-utils";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { fieldErrorsOf, passwordChangeSchema } from "@/lib/validators/account";

const empty = { currentPassword: "", newPassword: "", confirmPassword: "" };

export function PasswordForm() {
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = passwordChangeSchema.safeParse(values);
        if (!parsed.success) {
          setErrors(fieldErrorsOf(parsed.error));
          return;
        }
        setErrors({});
        start(async () => {
          const { error } = await authClient.changePassword({
            currentPassword: parsed.data.currentPassword,
            newPassword: parsed.data.newPassword,
            revokeOtherSessions: true,
          });
          if (error) {
            const msg = authErrorMessage(error, "パスワードを変更できませんでした。");
            if (error.code === "INVALID_PASSWORD") setErrors({ currentPassword: msg });
            toast.error(msg);
            return;
          }
          setValues(empty);
          toast.success("パスワードを変更しました。他の端末からはログアウトされます。");
        });
      }}
    >
      <FieldGroup className="gap-4">
        <Field data-invalid={!!errors.currentPassword}>
          <FieldLabel htmlFor="pw-current">現在のパスワード</FieldLabel>
          <PasswordInput id="pw-current" autoComplete="current-password" value={values.currentPassword} onChange={set("currentPassword")} aria-invalid={!!errors.currentPassword} />
          {errors.currentPassword && <FieldError>{errors.currentPassword}</FieldError>}
        </Field>
        <Field data-invalid={!!errors.newPassword}>
          <FieldLabel htmlFor="pw-new">新しいパスワード</FieldLabel>
          <PasswordInput id="pw-new" autoComplete="new-password" value={values.newPassword} onChange={set("newPassword")} aria-invalid={!!errors.newPassword} />
          {errors.newPassword ? <FieldError>{errors.newPassword}</FieldError> : <FieldDescription>8文字以上</FieldDescription>}
        </Field>
        <Field data-invalid={!!errors.confirmPassword}>
          <FieldLabel htmlFor="pw-confirm">新しいパスワード（確認）</FieldLabel>
          <PasswordInput id="pw-confirm" autoComplete="new-password" value={values.confirmPassword} onChange={set("confirmPassword")} aria-invalid={!!errors.confirmPassword} />
          {errors.confirmPassword && <FieldError>{errors.confirmPassword}</FieldError>}
        </Field>
      </FieldGroup>
      <Button type="submit" variant="outline" className="rounded-full" disabled={pending}>
        {pending && <Spinner />}パスワードを変更
      </Button>
    </form>
  );
}
