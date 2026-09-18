import { CalendarRange } from "lucide-react";
import Link from "next/link";
import { periodOptions } from "@/components/admin/labels";
import { routes } from "@/config/nav";
import { cn } from "@/lib/utils";

/** 7/30/90日 switch — URL state (?period=), rendered on the server. */
export function PeriodSwitch({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      <CalendarRange className="text-muted-foreground size-4" aria-hidden />
      <nav aria-label="集計期間" className="bg-muted/60 inline-flex rounded-xl p-1">
        {periodOptions.map((p) => {
          const active = p.days === current;
          return (
            <Link
              key={p.days}
              href={`${routes.admin.root}?period=${p.days}`}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                "num rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
