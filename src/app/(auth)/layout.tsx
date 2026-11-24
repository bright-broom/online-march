import Link from "next/link";
import { Logo } from "@/components/common/logo";
import { routes } from "@/config/nav";
import { siteConfig } from "@/config/site";

/**
 * ログイン・会員登録などの画面。フォームだけを1列で置く。
 * 写真とキャッチコピーを片側に大きく敷く2分割の画面はテンプレートの定番なので使わない（docs/DESIGN.md §8）。
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col px-5 py-6 sm:px-10">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <Logo />
        <Link href={routes.home} className="text-muted-foreground hover:text-foreground text-sm transition-colors">
          ストアへ戻る
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center py-10 sm:py-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="text-muted-foreground mx-auto flex w-full max-w-5xl flex-wrap gap-x-4 gap-y-1 text-xs">
        <span>© {siteConfig.name}</span>
        <Link href={routes.legal.terms} className="hover:text-foreground">利用規約</Link>
        <Link href={routes.legal.privacy} className="hover:text-foreground">プライバシーポリシー</Link>
      </footer>
    </div>
  );
}
