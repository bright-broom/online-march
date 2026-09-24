"use client";
import { AlertCircle, ArrowRight, Mail, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { demoAccounts, demoPassword } from "@/config/demo";
import { routes } from "@/config/nav";
import { authClient, signIn } from "@/lib/auth-client";
import { fieldErrorsOf, loginSchema } from "@/lib/validators/account";
import { cn } from "@/lib/utils";
import { authErrorMessage, homeForRole, safeNext } from "./auth-utils";
import { PasswordInput } from "./password-input";

export function LoginForm({ demo }: { demo: boolean }) {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [activeDemo, setActiveDemo] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function login(creds: { email: string; password: string }) {
    const parsed = loginSchema.safeParse(creds);
    if (!parsed.success) {
      setErrors(fieldErrorsOf(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    start(async () => {
      const { data, error } = await signIn.email({ email: parsed.data.email, password: parsed.data.password });
      if (error) {
        setFormError(authErrorMessage(error));
        setActiveDemo(null);
        return;
      }
      let role = (data?.user as { role?: string } | undefined)?.role;
      if (!role) {
        const s = await authClient.getSession();
        role = (s.data?.user as { role?: string } | undefined)?.role;
      }
      router.replace(next ?? homeForRole(role));
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          login({ email, password });
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!errors.email}
              />
            </InputGroup>
            {errors.email && <FieldError>{errors.email}</FieldError>}
          </Field>
          <Field data-invalid={!!errors.password}>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="password">パスワード</FieldLabel>
              <Link href={routes.forgotPassword} className="text-muted-foreground hover:text-primary text-xs underline-offset-4 hover:underline">
                パスワードをお忘れの方
              </Link>
            </div>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password}
            />
            {errors.password && <FieldError>{errors.password}</FieldError>}
          </Field>
          <Button type="submit" size="lg" className="h-11 rounded-full text-base" disabled={pending}>
            {pending && !activeDemo ? <Spinner /> : null}
            ログイン
            {!pending && <ArrowRight />}
          </Button>
        </FieldGroup>
      </form>

      <p className="text-muted-foreground text-center text-sm">
        はじめてご利用の方は{" "}
        <Link
          href={next ? `${routes.signup}?next=${encodeURIComponent(next)}` : routes.signup}
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          新規会員登録（無料）
        </Link>
      </p>

      {demo && (
        <div className="space-y-4">
          <FieldSeparator>デモアカウントで試す</FieldSeparator>
          <div className="grid gap-2.5">
            {demoAccounts.map((a) => {
              const busy = pending && activeDemo === a.email;
              return (
                <button
                  key={a.email}
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(demoPassword);
                    setActiveDemo(a.email);
                    login({ email: a.email, password: demoPassword });
                  }}
                  className={cn(
                    "group bg-card hover:border-primary/50 hover:bg-primary/5 focus-visible:ring-ring/50 flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors outline-none focus-visible:ring-3 disabled:opacity-60",
                    busy && "border-primary/50 bg-primary/5",
                  )}
                >
                  <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full font-serif text-base">
                    {a.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium">{a.name}</span>
                      <Badge variant="secondary" className="rounded-full text-[10px]">{a.label}</Badge>
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">{a.email}</span>
                  </span>
                  {busy ? (
                    <Spinner className="text-primary" />
                  ) : (
                    <Sparkles className="text-muted-foreground group-hover:text-primary size-4 transition-colors" />
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-muted-foreground text-center text-xs">
            クリックするとデモ用のアカウントでログインします（パスワード: <code className="font-mono">{demoPassword}</code>）
          </p>
        </div>
      )}
    </div>
  );
}
