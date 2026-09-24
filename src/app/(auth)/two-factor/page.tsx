import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFormSkeleton } from "@/components/auth/auth-form-skeleton";
import { TwoFactorForm } from "@/components/auth/two-factor-form";

export const metadata: Metadata = { title: "二段階認証", robots: { index: false } };

export default function TwoFactorPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="eyebrow">Two-step verification</p>
        <h1 className="heading-display text-3xl">二段階認証</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">認証アプリに表示されている6桁のコードを入力してください。</p>
      </div>
      <Suspense fallback={<AuthFormSkeleton fields={1} />}>
        <TwoFactorForm />
      </Suspense>
    </div>
  );
}
