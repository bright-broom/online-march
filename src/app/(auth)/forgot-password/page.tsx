import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "パスワードの再設定", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="eyebrow">Reset password</p>
        <h1 className="heading-display text-3xl">パスワードの再設定</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          ご登録のメールアドレスに、新しいパスワードを設定するためのリンクをお送りします。
        </p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
