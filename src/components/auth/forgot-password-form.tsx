"use client";
import { AlertCircle, ArrowRight, MailCheck, Mail } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { routes } from "@/config/nav";
import { authClient } from "@/lib/auth-client";
import { fieldErrorsOf, forgotPasswordSchema } from "@/lib/validators/account";
import { authErrorMessage } from "./auth-utils";

/**
 * 再設定メールの申し込み。登録の有無にかかわらず同じ「送信しました」を出す（会員かどうかを外に漏らさない）。
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setErrors(fieldErrorsOf(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    start(async () => {
      const { error } = await authClient.requestPasswordReset({ email: parsed.data.email, redirectTo: routes.resetPassword });
      if (error) {
        setFormError(authErrorMessage(error));
        return;
      }
      setSentTo(parsed.data.email);
    });
  }

  if (sentTo) {
    return (
      <div className="space-y-6">
        <Alert>
          <MailCheck />
          <AlertTitle>メールを送信しました</AlertTitle>
          <AlertDescription>
            {sentTo} が登録されている場合、パスワード再設定のご案内が届きます。リンクの有効期限は1時間です。
            届かないときは迷惑メールフォルダもご確認ください。
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline" size="lg" className="h-11 w-full rounded-full">
          <Link href={routes.login}>ログイン画面へ戻る</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <FieldGroup>
        {formError && (
          <Alert variant="destructive" aria-live="polite">
            <AlertCircle />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="email">ご登録のメールアドレス</FieldLabel>
          <InputGroup className="h-11">
            <InputGroupAddon>
              <Mail />
            </InputGroupAddon>
            <InputGroupInput
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!errors.email}
            />
          </InputGroup>
          {errors.email && <FieldError>{errors.email}</FieldError>}
        </Field>
        <Button type="submit" size="lg" className="h-11 rounded-full text-base" disabled={pending}>
          {pending ? <Spinner /> : null}
          再設定メールを送る
          {!pending && <ArrowRight />}
        </Button>
        <p className="text-muted-foreground text-center text-sm">
          <Link href={routes.login} className="text-primary font-medium underline-offset-4 hover:underline">
            ログイン画面へ戻る
          </Link>
        </p>
      </FieldGroup>
    </form>
  );
}
