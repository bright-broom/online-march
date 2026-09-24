"use client";
import { AlertCircle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { routes } from "@/config/nav";
import { authClient } from "@/lib/auth-client";
import { fieldErrorsOf, resetPasswordSchema } from "@/lib/validators/account";
import { authErrorMessage } from "./auth-utils";
import { PasswordInput } from "./password-input";

/**
 * メールのリンク → Better Auth（/api/auth/reset-password/:token）が検証して ?token= 付きでここへ戻す。
 * 期限切れ・使用済みのリンクは ?error=INVALID_TOKEN で戻ってくる。
 */
export function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token");
  const linkError = params.get("error");
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!token || linkError) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{authErrorMessage({ code: "INVALID_TOKEN" })}</AlertDescription>
        </Alert>
        <Button asChild size="lg" className="h-11 w-full rounded-full">
          <Link href={routes.forgotPassword}>再設定メールをもう一度送る</Link>
        </Button>
      </div>
    );
  }

  function submit(t: string) {
    const parsed = resetPasswordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      setErrors(fieldErrorsOf(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    start(async () => {
      const { error } = await authClient.resetPassword({ newPassword: parsed.data.password, token: t });
      if (error) {
        setFormError(authErrorMessage(error));
        return;
      }
      toast.success("パスワードを変更しました。新しいパスワードでログインしてください");
      router.replace(routes.login);
    });
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit(token);
      }}
    >
      <FieldGroup>
        {formError && (
          <Alert variant="destructive" aria-live="polite">
            <AlertCircle />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password">新しいパスワード</FieldLabel>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!errors.password}
          />
          <FieldDescription>8文字以上。ほかのサービスと同じものは避けてください。</FieldDescription>
          {errors.password && <FieldError>{errors.password}</FieldError>}
        </Field>
        <Field data-invalid={!!errors.confirmPassword}>
          <FieldLabel htmlFor="confirmPassword">新しいパスワード（確認）</FieldLabel>
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            aria-invalid={!!errors.confirmPassword}
          />
          {errors.confirmPassword && <FieldError>{errors.confirmPassword}</FieldError>}
        </Field>
        <p className="text-muted-foreground text-xs">変更すると、ほかの端末ではログアウトされます。</p>
        <Button type="submit" size="lg" className="h-11 rounded-full text-base" disabled={pending}>
          {pending ? <Spinner /> : null}
          パスワードを変更する
          {!pending && <ArrowRight />}
        </Button>
      </FieldGroup>
    </form>
  );
}
