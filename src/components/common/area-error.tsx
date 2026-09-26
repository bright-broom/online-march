"use client";
import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

/**
 * 管理画面（運営・生産者・マイページ）の中で起きたエラー（#21）。ルートの error.tsx だとサイドバーごと消えて
 * 迷子になるので、各エリアの error.tsx からこれを出し、メニューは残したまま「もう一度」と「エリアのトップ」を示す。
 * サーバー側のエラーは instrumentation.ts で運営に届く（#12）。エラーIDはその突き合わせ用。
 */
export function AreaError({ error, retry, homeHref, homeLabel }: { error: Error & { digest?: string }; retry: () => void; homeHref: string; homeLabel: string }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="mx-auto flex max-w-lg flex-col items-center gap-4 py-16 text-center">
      <h1 className="heading-display text-xl">この画面を表示できませんでした</h1>
      <p className="text-muted-foreground text-sm leading-relaxed">
        一時的な問題の可能性があります。もう一度お試しください。続く場合は {siteConfig.contact.email} までご連絡ください。
      </p>
      {error.digest && <p className="text-muted-foreground/70 font-mono text-[11px]">エラーID: {error.digest}</p>}
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => retry()} className="rounded-full">
          <RotateCcw />
          もう一度試す
        </Button>
        <Button asChild variant="outline" className="rounded-full">
          <Link href={homeHref}>{homeLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
