import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthFormSkeleton } from "@/components/auth/auth-form-skeleton";
import { TwoFactorSetup } from "@/components/auth/two-factor-setup";
import { roleHome, routes } from "@/config/nav";
import { getSessionUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "二段階認証の設定", robots: { index: false } };

export default function TwoFactorSetupPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="eyebrow">Two-step verification</p>
        <h1 className="heading-display text-3xl">二段階認証の設定</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          運営画面は返金やお客さまの個人情報を扱うため、パスワードに加えて認証アプリのコードでログインしていただきます。
        </p>
      </div>
      <Suspense fallback={<AuthFormSkeleton fields={1} />}>
        <Setup />
      </Suspense>
    </div>
  );
}

/** requireUser は未設定の運営をここへ送るので、ここでは使わない（使うとループする） */
async function Setup() {
  const user = await getSessionUser();
  if (!user) redirect(`${routes.login}?next=${encodeURIComponent(routes.twoFactorSetup)}`);
  if (user.twoFactorEnabled) redirect(roleHome[user.role]);
  return <TwoFactorSetup role={user.role} />;
}
