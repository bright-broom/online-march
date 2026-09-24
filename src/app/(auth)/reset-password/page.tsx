import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFormSkeleton } from "@/components/auth/auth-form-skeleton";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = { title: "新しいパスワードの設定", robots: { index: false } };

export default function ResetPasswordPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="eyebrow">Reset password</p>
        <h1 className="heading-display text-3xl">新しいパスワードの設定</h1>
      </div>
      {/* ?token= を読むので Suspense の中（Cache Components） */}
      <Suspense fallback={<AuthFormSkeleton />}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
