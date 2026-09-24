"use client";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { AlertCircle, ArrowRight, KeyRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage, homeForRole, safeNext } from "./auth-utils";

/** パスワードの後の2段目。認証アプリの6桁コード、またはバックアップコードで入る。 */
export function TwoFactorForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(value: string) {
    if (mode === "totp" && !/^\d{6}$/.test(value)) {
      setFormError("6桁の数字を入力してください");
      return;
    }
    if (mode === "backup" && !value.trim()) {
      setFormError("バックアップコードを入力してください");
      return;
    }
    setFormError(null);
    start(async () => {
      const { data, error } =
        mode === "totp"
          ? await authClient.twoFactor.verifyTotp({ code: value, trustDevice })
          : await authClient.twoFactor.verifyBackupCode({ code: value.trim(), trustDevice });
      if (error) {
        setFormError(error.status === 401 ? "コードが正しくありません。時刻がずれていないかもご確認ください。" : authErrorMessage(error));
        setCode("");
        return;
      }
      const role = (data?.user as { role?: string } | undefined)?.role;
      router.replace(next ?? homeForRole(role));
      router.refresh();
    });
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit(code);
      }}
    >
      <FieldGroup>
        {formError && (
          <Alert variant="destructive" aria-live="polite">
            <AlertCircle />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        {mode === "totp" ? (
          <Field>
            <FieldLabel htmlFor="otp">認証アプリの6桁のコード</FieldLabel>
            <InputOTP
              id="otp"
              maxLength={6}
              pattern={REGEXP_ONLY_DIGITS}
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(v) => {
                setCode(v);
                if (v.length === 6) submit(v);
              }}
            >
              <InputOTPGroup>
                {Array.from({ length: 6 }, (_, i) => (
                  <InputOTPSlot key={i} index={i} className="size-11 text-lg" />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor="backup">バックアップコード</FieldLabel>
            <InputGroup className="h-11">
              <InputGroupAddon>
                <KeyRound />
              </InputGroupAddon>
              <InputGroupInput id="backup" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
            </InputGroup>
          </Field>
        )}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={trustDevice} onCheckedChange={(v) => setTrustDevice(v === true)} />
          この端末では30日間コードを聞かない
        </label>
        <Button type="submit" size="lg" className="h-11 rounded-full text-base" disabled={pending}>
          {pending ? <Spinner /> : null}
          確認してログイン
          {!pending && <ArrowRight />}
        </Button>
        <button
          type="button"
          className="text-muted-foreground hover:text-primary text-center text-sm underline-offset-4 hover:underline"
          onClick={() => {
            setMode(mode === "totp" ? "backup" : "totp");
            setCode("");
            setFormError(null);
          }}
        >
          {mode === "totp" ? "端末が手元にない場合（バックアップコードを使う）" : "認証アプリのコードを使う"}
        </button>
      </FieldGroup>
    </form>
  );
}
