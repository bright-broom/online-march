import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/common/logo";
import { images } from "@/config/images";
import { routes } from "@/config/nav";
import { siteConfig } from "@/config/site";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-5 py-6 sm:px-10 lg:px-14">
        <header className="flex items-center justify-between">
          <Logo />
          <Link href={routes.home} className="text-muted-foreground hover:text-foreground text-sm transition-colors">
            ストアへ戻る
          </Link>
        </header>
        <main className="flex flex-1 items-center justify-center py-10">
          <div className="animate-fade-up w-full max-w-md">{children}</div>
        </main>
        <footer className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span>© {siteConfig.name}</span>
          <Link href={routes.legal.terms} className="hover:text-foreground">利用規約</Link>
          <Link href={routes.legal.privacy} className="hover:text-foreground">プライバシーポリシー</Link>
        </footer>
      </div>
      <aside className="relative hidden overflow-hidden lg:block">
        <Image
          src={images.fieldRows}
          alt="南あわじの玉ねぎ畑"
          fill
          priority
          sizes="(min-width: 1024px) 52vw, 0px"
          className="object-cover"
        />
        <div className="from-foreground/75 via-foreground/20 absolute inset-0 bg-linear-to-t to-transparent" />
        <div className="text-background absolute inset-x-0 bottom-0 space-y-4 p-12">
          <p className="font-display text-xs tracking-[0.32em] uppercase opacity-80">{siteConfig.shortName}</p>
          <p className="heading-display text-3xl leading-snug xl:text-4xl">{siteConfig.tagline}</p>
          <p className="max-w-md text-sm leading-relaxed opacity-85">{siteConfig.description}</p>
        </div>
      </aside>
    </div>
  );
}
