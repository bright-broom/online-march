import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFormSkeleton } from "@/components/auth/auth-form-skeleton";
import { RedirectIfSignedIn } from "@/components/auth/redirect-if-signed-in";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = { title: "新規会員登録" };

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <div className="space-y-8">
      <Suspense fallback={null}>
        <RedirectIfSignedIn searchParams={searchParams} />
      </Suspense>
      <div className="space-y-2">
        <h1 className="heading-display text-3xl">会員登録（無料）</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          登録すると、注文の状況と追跡番号をマイページで確認でき、生産者さんにメッセージも送れます。
        </p>
      </div>
      <Suspense fallback={<AuthFormSkeleton fields={4} />}>
        <SignupForm />
      </Suspense>
    </div>
  );
}
