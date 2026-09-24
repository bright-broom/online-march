"use client";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { AlertCircle, ArrowRight, Copy, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { renderSVG } from "uqr";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage, homeForRole, safeNext } from "./auth-utils";
import { PasswordInput } from "./password-input";

/**
 * 二段階認証の設定。① パスワードを確認 → ② QR を認証アプリで読む・バックアップコードを控える → ③ 表示された6桁で確認。
 * ③ が通るまでは有効にならないので、読み取りに失敗しても締め出されない。
 */
export function TwoFactorSetup({ role }: { role: string }) {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<{ totpURI: string; backupCodes: string[] } | null>(null);
  const [code, setCode] = useState("");
  const [savedCodes, setSavedCodes] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const qr = useMemo(() => (setup ? renderSVG(setup.totpURI, { border: 1 }) : ""), [setup]);
  const secret = useMemo(() => (setup ? (new URL(setup.totpURI).searchParams.get("secret") ?? "") : ""), [setup]);

  function begin() {
    if (!password) {
      setFormError("パスワードを入力してください");
      return;
    }
    setFormError(null);
    start(async () => {
      const { data, error } = await authClient.twoFactor.enable({ password, method: "totp" });
      if (error || !data || data.method !== "totp") {
        setFormError(authErrorMessage(error));
        return;
      }
      setSetup({ totpURI: data.totpURI, backupCodes: data.backupCodes });
    });
  }

  function confirm(value: string) {
    if (!/^\d{6}$/.test(value)) return;
    setFormError(null);
    start(async () => {
      const { error } = await authClient.twoFactor.verifyTotp({ code: value });
      if (error) {
        setFormError("コードが正しくありません。認証アプリに表示されている最新のコードを入力してください。");
        setCode("");
        return;
      }
      toast.success("二段階認証を有効にしました");
      router.replace(next ?? homeForRole(role));
      router.refresh();
    });
  }

  if (!setup) {
    return (
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          begin();
        }}
      >
        <FieldGroup>
          {formError && (
            <Alert variant="destructive" aria-live="polite">
              <AlertCircle />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <Field>
            <FieldLabel htmlFor="password">現在のパスワード</FieldLabel>
            <PasswordInput id="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <FieldDescription>本人確認のため、もう一度パスワードを入力してください。</FieldDescription>
          </Field>
          <Button type="submit" size="lg" className="h-11 rounded-full text-base" disabled={pending}>
            {pending ? <Spinner /> : null}
            設定をはじめる
            {!pending && <ArrowRight />}
          </Button>
        </FieldGroup>
      </form>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-medium">1. 認証アプリで読み取る</h2>
        <p className="text-muted-foreground text-sm">Google Authenticator・Microsoft Authenticator・1Password などで QR コードを読み取ってください。</p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          {/* uqr が生成した SVG（外部に秘密鍵を送らないため、手元で描画する） */}
          <div className="size-44 shrink-0 rounded-lg bg-white p-2 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} aria-label="二段階認証の QR コード" role="img" />
          <div className="min-w-0 space-y-1 text-sm">
            <p className="text-muted-foreground">読み取れない場合は、このキーを手入力してください。</p>
            <code className="bg-muted block rounded px-2 py-1 font-mono text-xs break-all">{secret}</code>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">2. バックアップコードを控える</h2>
        <Alert>
          <ShieldCheck />
          <AlertTitle>端末をなくしたときに、1つにつき1回だけ使えます</AlertTitle>
          <AlertDescription>
            この画面を閉じると二度と表示されません。パスワード管理アプリなど、安全な場所に保管してください。
          </AlertDescription>
        </Alert>
        <ul className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-3 font-mono text-sm">
          {setup.backupCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={async () => {
            await navigator.clipboard.writeText(setup.backupCodes.join("\n"));
            setSavedCodes(true);
            toast.success("バックアップコードをコピーしました");
          }}
        >
          <Copy />
          コピーする
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" checked={savedCodes} onChange={(e) => setSavedCodes(e.target.checked)} />
          安全な場所に控えました
        </label>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">3. 表示された6桁のコードで確認</h2>
        {formError && (
          <Alert variant="destructive" aria-live="polite">
            <AlertCircle />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        <InputOTP
          maxLength={6}
          pattern={REGEXP_ONLY_DIGITS}
          autoComplete="one-time-code"
          value={code}
          disabled={!savedCodes || pending}
          onChange={(v) => {
            setCode(v);
            if (v.length === 6) confirm(v);
          }}
        >
          <InputOTPGroup>
            {Array.from({ length: 6 }, (_, i) => (
              <InputOTPSlot key={i} index={i} className="size-11 text-lg" />
            ))}
          </InputOTPGroup>
        </InputOTP>
        {!savedCodes && <p className="text-muted-foreground text-xs">バックアップコードを控えてから入力できます。</p>}
      </section>
    </div>
  );
}
