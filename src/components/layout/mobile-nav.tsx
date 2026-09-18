"use client";
import { ChevronRight, Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/common/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { categories, categoryKeys } from "@/config/catalog";
import { footerNav, routes, shopNav } from "@/config/nav";
import { siteConfig } from "@/config/site";
import { HeaderSearch } from "./shop-header-actions";

/** Mobile drawer navigation (< lg). Closes on any link tap. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const support = footerNav.find((g) => g.items.some((i) => i.href === routes.faq));
  const joinItem = footerNav.flatMap((g) => g.items).find((i) => i.href === routes.join);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-lg" className="-ml-2 rounded-full lg:hidden" aria-label="メニューを開く">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[88vw] max-w-sm gap-0 overflow-y-auto p-0">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle className="sr-only">メニュー</SheetTitle>
          <SheetDescription className="sr-only">{siteConfig.tagline}</SheetDescription>
          <div onClick={close}>
            <Logo />
          </div>
        </SheetHeader>
        <div className="space-y-7 px-5 py-5">
          <HeaderSearch onSubmitted={close} />

          <nav aria-label="メインメニュー">
            <ul className="-mx-2">
              {shopNav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={close}
                    className="hover:bg-muted flex min-h-12 items-center gap-3 rounded-xl px-2 text-[15px] font-medium transition-colors"
                  >
                    {item.icon && <item.icon className="text-primary size-5" />}
                    <span className="flex-1">{item.title}</span>
                    <ChevronRight className="text-muted-foreground size-4" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <p className="eyebrow mb-3">Categories</p>
            <ul className="grid grid-cols-2 gap-2">
              {categoryKeys.map((key) => (
                <li key={key}>
                  <Link
                    href={`${routes.products}?category=${key}`}
                    onClick={close}
                    className="bg-paper hover:bg-accent flex min-h-11 items-center rounded-xl px-3 text-sm transition-colors"
                  >
                    {categories[key].label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {support && (
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-medium">{support.title}</p>
              <ul className="-mx-2">
                {[...support.items, ...(joinItem ? [joinItem] : [])].map((i) => (
                  <li key={i.href}>
                    <Link href={i.href} onClick={close} className="hover:bg-muted flex min-h-11 items-center rounded-lg px-2 text-sm transition-colors">
                      {i.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-muted-foreground border-t pt-5 text-xs leading-relaxed">
            {siteConfig.contact.email}
            <br />
            {siteConfig.contact.hours}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
