import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/common/logo";
import { Button } from "@/components/ui/button";
import { routes, shopNav } from "@/config/nav";

/** Shared 404 body (inside the shop layout and at the root). */
export function NotFoundContent() {
  return (
    <section className="bg-grain flex flex-1 items-center">
      <div className="container-page flex flex-col items-center py-24 text-center sm:py-32">
        <LogoMark className="size-14 -rotate-12 opacity-90" />
        <p className="font-display text-primary mt-6 text-7xl font-light tracking-tight sm:text-8xl">404</p>
        <h1 className="heading-display mt-4 text-2xl sm:text-3xl">お探しのページが見つかりませんでした</h1>
        <p className="text-muted-foreground mt-4 max-w-md text-sm leading-relaxed">
          ページが移動したか、販売が終了した可能性があります。畑の玉ねぎは今日も元気に育っています。
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Button asChild className="h-11 rounded-full px-6">
            <Link href={routes.products}>
              商品をさがす
              <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11 rounded-full px-6">
            <Link href={routes.home}>トップへ戻る</Link>
          </Button>
        </div>
        <ul className="text-muted-foreground mt-10 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
          {shopNav.map((n) => (
            <li key={n.href}>
              <Link href={n.href} className="hover:text-primary underline-offset-4 hover:underline">
                {n.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
