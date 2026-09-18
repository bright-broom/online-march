import { Heart, MessageCircle, Truck } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthFormSkeleton } from "@/components/auth/auth-form-skeleton";
import { RedirectIfSignedIn } from "@/components/auth/redirect-if-signed-in";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = { title: "新規会員登録" };

const benefits = [
  { icon: Truck, title: "届くまで見守れる", body: "出荷準備から配達完了まで、状況と追跡番号をお知らせします。" },
  { icon: MessageCircle, title: "生産者さんと話せる", body: "食べ方や保存方法を、つくり手に直接聞けます。" },
  { icon: Heart, title: "お気に入り・フォロー", body: "気になる玉ねぎや農家さんの新商品をすぐにチェック。" },
];

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <div className="space-y-8">
      <Suspense fallback={null}>
        <RedirectIfSignedIn searchParams={searchParams} />
      </Suspense>
      <div className="space-y-2">
        <p className="eyebrow">Create account</p>
        <h1 className="heading-display text-3xl">会員登録（無料）</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">登録は1分。すぐにお買い物をはじめられます。</p>
      </div>
      <ul className="bg-paper grid gap-3 rounded-2xl border p-4">
        {benefits.map((b) => (
          <li key={b.title} className="flex gap-3">
            <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full">
              <b.icon className="size-4" />
            </span>
            <span className="text-sm">
              <span className="font-medium">{b.title}</span>
              <span className="text-muted-foreground block text-xs leading-relaxed">{b.body}</span>
            </span>
          </li>
        ))}
      </ul>
      <Suspense fallback={<AuthFormSkeleton fields={4} />}>
        <SignupForm />
      </Suspense>
    </div>
  );
}
