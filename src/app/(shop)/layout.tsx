import { Suspense } from "react";
import { CartSheet } from "@/components/layout/cart-sheet";
import { ShopAnnouncementBar } from "@/components/layout/shop-announcement-bar";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { EngagementHydrator } from "@/components/shop/engagement-hydrator";

/**
 * Public storefront shell. Everything here is static except the Suspense-wrapped
 * user area (header) and the engagement hydrator (favorite/follow ids).
 */
export default function ShopLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#main"
        className="bg-primary text-primary-foreground sr-only z-50 rounded-full px-4 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        本文へスキップ
      </a>
      <ShopAnnouncementBar />
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <CartSheet />
      <Suspense fallback={null}>
        <EngagementHydrator />
      </Suspense>
    </div>
  );
}
