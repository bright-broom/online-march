import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFormSkeleton } from "@/components/auth/auth-form-skeleton";
import { LoginForm } from "@/components/auth/login-form";
import { RedirectIfSignedIn } from "@/components/auth/redirect-if-signed-in";
import { features } from "@/lib/env";

export const metadata: Metadata = { title: "ログイン", robots: { index: false } };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="space-y-8">
      <Suspense fallback={null}>
        <RedirectIfSignedIn searchParams={searchParams} />
      </Suspense>
      <div className="space-y-2">
        <p className="eyebrow">Sign in</p>
        <h1 className="heading-display text-3xl">おかえりなさい</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          ご注文の確認や、生産者さんとのメッセージはログインしてご利用ください。
        </p>
      </div>
      <Suspense fallback={<AuthFormSkeleton />}>
        <LoginForm demo={features.demo} />
      </Suspense>
    </div>
  );
}
