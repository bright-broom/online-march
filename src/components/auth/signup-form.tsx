"use client";
import { AlertCircle, ArrowRight, Mail, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { roleHome, routes } from "@/config/nav";
import { signUp } from "@/lib/auth-client";
import { fieldErrorsOf, signupSchema } from "@/lib/validators/account";
import { authErrorMessage, safeNext } from "./auth-utils";
import { PasswordInput } from "./password-input";

export function SignupForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [values, setValues] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = signupSchema.safeParse({ ...values, agree });
    if (!parsed.success) {
      setErrors(fieldErrorsOf(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    start(async () => {
      const { error } = await signUp.email({ name: parsed.data.name, email: parsed.data.email, password: parsed.data.password });
      if (error) {
        setFormError(authErrorMessage(error));
        return;
      }
      // 登録時に確認メールを送っている（#16）。確認しなくても使えるが、届くアドレスか確かめてもらう
      toast.success(`${parsed.data.email} に確認メールを送りました`, { description: "メールのボタンを押して、アドレスの確認を済ませてください。" });
      router.replace(next ?? roleHome.customer);
      router.refresh();
    });
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-6">
      <FieldGroup>
        {formError && (
          <Alert variant="destructive" aria-live="polite">
            <AlertCircle />
            <AlertDescription>
              {formError}
              {formError.includes("ログイン") && (
                <Link href={next ? `${routes.login}?next=${encodeURIComponent(next)}` : routes.login} className="ml-1 underline underline-offset-4">
                  ログインへ
                </Link>
              )}
            </AlertDescription>
          </Alert>
        )}
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="name">お名前</FieldLabel>
          <InputGroup className="h-11">
            <InputGroupAddon>
              <UserRound />
            </InputGroupAddon>
            <InputGroupInput id="name" autoComplete="name" placeholder="淡路 花子" value={values.name} onChange={set("name")} aria-invalid={!!errors.name} />
          </InputGroup>
          {errors.name && <FieldError>{errors.name}</FieldError>}
        </Field>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="email">メールアドレス</FieldLabel>
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
              value={values.email}
              onChange={set("email")}
              aria-invalid={!!errors.email}
            />
          </InputGroup>
          {errors.email ? <FieldError>{errors.email}</FieldError> : <FieldDescription>注文確認・発送のお知らせをお送りします。</FieldDescription>}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="password">パスワード</FieldLabel>
            <PasswordInput id="password" autoComplete="new-password" value={values.password} onChange={set("password")} aria-invalid={!!errors.password} />
            {errors.password ? <FieldError>{errors.password}</FieldError> : <FieldDescription>8文字以上</FieldDescription>}
          </Field>
          <Field data-invalid={!!errors.confirmPassword}>
            <FieldLabel htmlFor="confirmPassword">パスワード（確認）</FieldLabel>
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              value={values.confirmPassword}
              onChange={set("confirmPassword")}
              aria-invalid={!!errors.confirmPassword}
            />
            {errors.confirmPassword && <FieldError>{errors.confirmPassword}</FieldError>}
          </Field>
        </div>
        <Field orientation="horizontal" data-invalid={!!errors.agree}>
          <Checkbox id="agree" checked={agree} onCheckedChange={(v) => setAgree(v === true)} aria-invalid={!!errors.agree} />
          <FieldLabel htmlFor="agree" className="text-sm leading-relaxed font-normal">
            <span>
              <Link href={routes.legal.terms} target="_blank" className="text-primary underline underline-offset-4">
                利用規約
              </Link>
              と
              <Link href={routes.legal.privacy} target="_blank" className="text-primary underline underline-offset-4">
                プライバシーポリシー
              </Link>
              に同意します
            </span>
          </FieldLabel>
        </Field>
        {errors.agree && <FieldError className="-mt-3">{errors.agree}</FieldError>}
        <Button type="submit" size="lg" className="h-11 rounded-full text-base" disabled={pending}>
          {pending && <Spinner />}
          無料で会員登録
          {!pending && <ArrowRight />}
        </Button>
      </FieldGroup>
      <p className="text-muted-foreground text-center text-sm">
        すでにアカウントをお持ちの方は{" "}
        <Link
          href={next ? `${routes.login}?next=${encodeURIComponent(next)}` : routes.login}
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          ログイン
        </Link>
      </p>
    </form>
  );
}
