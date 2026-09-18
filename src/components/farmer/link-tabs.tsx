import Link from "next/link";
import { cn } from "@/lib/utils";

export type LinkTab = { key: string; label: string; href: string; count?: number; highlight?: boolean };

/** URL-driven tabs (server-rendered filter; shareable URLs). Horizontally scrollable on phones. */
export function LinkTabs({ tabs, active, className }: { tabs: LinkTab[]; active: string; className?: string }) {
  return (
    <nav aria-label="絞り込み" className={cn("scrollbar-none -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)}>
      <ul className="bg-muted inline-flex min-w-max gap-1 rounded-xl p-1">
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <li key={t.key}>
              <Link
                href={t.href}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors",
                  on ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                {t.count != null && (
                  <span
                    className={cn(
                      "num min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5",
                      t.highlight && t.count > 0 ? "bg-primary text-primary-foreground" : "bg-foreground/10",
                    )}
                  >
                    {t.count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
