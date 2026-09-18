"use client";
import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { LogoMark } from "@/components/common/logo";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/nav";
import { siteConfig } from "@/config/site";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="bg-grain flex min-h-[70svh] flex-1 items-center">
      <div className="container-page flex flex-col items-center py-24 text-center">
        <LogoMark className="size-14 rotate-12 opacity-80 grayscale-[40%]" />
        <h1 className="heading-display mt-6 text-2xl sm:text-3xl">ページを表示できませんでした</h1>
        <p className="text-muted-foreground mt-4 max-w-md text-sm leading-relaxed">
          一時的な問題が発生しています。少し時間をおいて、もう一度お試しください。解決しない場合は {siteConfig.contact.email} までご連絡ください。
        </p>
        {error.digest && <p className="text-muted-foreground/70 font-mono mt-3 text-[11px]">エラーID: {error.digest}</p>}
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Button onClick={() => retry()} className="h-11 rounded-full px-6">
            <RotateCcw />
            もう一度試す
          </Button>
          <Button asChild variant="outline" className="h-11 rounded-full px-6">
            <Link href={routes.home}>トップへ戻る</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
