import { UserRound } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/common/logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/nav";
import { farmAccessOf } from "@/server/auth/guards";
import { getSessionUser } from "@/server/auth/session";
import { MobileNav } from "./mobile-nav";
import { HeaderCartButton, HeaderFavoritesButton, HeaderSearch } from "./shop-header-actions";
import { ShopNav, ShopNavList } from "./shop-nav";
import { UserMenu } from "./user-menu";

/** Request-time user area (reads the session cookie) — always rendered inside <Suspense>. */
async function HeaderUser() {
  const user = await getSessionUser();
  // 購入者のアカウントで農園のスタッフをしている人には、生産者画面への入口を出す（#24）
  const staff = user?.role === "customer" ? await farmAccessOf(user.id, user.role) : null;
  if (!user) {
    return (
      <>
        <Button asChild variant="ghost" size="icon-lg" className="rounded-full sm:hidden">
          <Link href={routes.login} aria-label="ログイン">
            <UserRound className="size-5" />
          </Link>
        </Button>
        <Button asChild variant="outline" className="ml-1 hidden h-9 rounded-full px-4 sm:inline-flex">
          <Link href={routes.login}>ログイン</Link>
        </Button>
      </>
    );
  }
  return (
    <div className="ml-1">
      <UserMenu compact user={{ name: user.name, email: user.email, role: user.role, staffFarmName: staff?.access !== "owner" ? staff?.farm.name : null }} />
    </div>
  );
}

/** Sticky translucent storefront header. Static shell + streamed user area. */
export function SiteHeader() {
  return (
    <header className="border-border/70 bg-background/80 supports-[backdrop-filter]:bg-background/65 sticky top-0 z-40 border-b backdrop-blur-xl">
      <div className="container-page flex h-16 items-center gap-2 lg:gap-6">
        <MobileNav />
        <Logo className="shrink-0" />
        <Suspense fallback={<ShopNavList pathname={null} className="hidden lg:flex" />}>
          <ShopNav className="hidden lg:flex" />
        </Suspense>
        <div className="ml-auto flex items-center gap-0.5">
          <HeaderSearch className="mr-2 hidden w-56 md:block xl:w-64" />
          <HeaderFavoritesButton className="hidden sm:inline-flex" />
          <HeaderCartButton />
          <Suspense fallback={<Skeleton className="ml-1 size-9 rounded-full" />}>
            <HeaderUser />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
