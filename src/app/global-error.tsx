"use client";
import { useEffect } from "react";
import { siteConfig } from "@/config/site";
import "./globals.css";

/**
 * Replaces the root layout when it crashes. Must render its own <html>/<body>;
 * kept dependency-light (no providers) so it works even if they failed.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ja">
      <body className="bg-background text-foreground font-sans antialiased">
        <title>{`エラーが発生しました | ${siteConfig.name}`}</title>
        <main className="flex min-h-svh flex-col items-center justify-center gap-5 px-6 text-center">
          <p className="font-serif text-lg font-semibold tracking-[0.06em]">{siteConfig.name}</p>
          <h1 className="font-serif text-2xl font-semibold">申し訳ありません。問題が発生しました</h1>
          <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
            ページの読み込み中にエラーが発生しました。再読み込みしても解決しない場合は {siteConfig.contact.email} までご連絡ください。
          </p>
          {error.digest && <p className="text-muted-foreground font-mono text-[11px]">エラーID: {error.digest}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => retry()}
              className="bg-primary text-primary-foreground h-11 rounded-full px-6 text-sm font-medium"
            >
              もう一度試す
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- router may be unavailable here */}
            <a href="/" className="h-11 rounded-full border px-6 text-sm leading-[2.75rem] font-medium">
              トップへ戻る
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
