"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { shopNav } from "@/config/nav";
import { cn } from "@/lib/utils";

const isActive = (pathname: string | null, href: string) =>
  !!pathname && (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

/** Presentational desktop nav. `pathname=null` renders without an active item (Suspense fallback). */
export function ShopNavList({ pathname, className }: { pathname: string | null; className?: string }) {
  return (
    <nav aria-label="メインメニュー" className={cn("items-center gap-1", className)}>
      {shopNav.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative rounded-full px-3 py-2 text-[13px] font-medium tracking-wide transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.title}
            <span
              aria-hidden
              className={cn(
                "bg-primary absolute inset-x-3 -bottom-px h-0.5 origin-left rounded-full transition-transform duration-300",
                active ? "scale-x-100" : "scale-x-0",
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}

/** Active-aware nav. usePathname suspends on unknown dynamic params → render inside <Suspense>. */
export function ShopNav({ className }: { className?: string }) {
  const pathname = usePathname();
  return <ShopNavList pathname={pathname} className={className} />;
}
