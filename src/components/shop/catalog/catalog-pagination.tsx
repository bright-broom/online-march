import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/nav";
import { cn } from "@/lib/utils";
import { serializeCatalog, type CatalogParams } from "./catalog-params";

/** 1 … 4 5 [6] 7 8 … 20 */
function pageWindow(page: number, pageCount: number): (number | "gap")[] {
  const set = new Set([1, pageCount, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pageCount));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push("gap");
    out.push(n);
  });
  return out;
}

/** Server-rendered pagination (plain links → shareable, prefetchable). */
export function CatalogPagination({ params, page, pageCount }: { params: CatalogParams; page: number; pageCount: number }) {
  if (pageCount <= 1) return null;
  const href = (n: number) => serializeCatalog(routes.products, { ...params, page: n === 1 ? null : n });
  const arrow = "h-10 rounded-full px-3";
  return (
    <nav aria-label="ページ送り" className="mt-14 flex items-center justify-center gap-1">
      {page > 1 ? (
        <Button asChild variant="ghost" className={arrow}>
          <Link href={href(page - 1)} scroll>
            <ChevronLeft />
            <span className="hidden sm:inline">前へ</span>
          </Link>
        </Button>
      ) : (
        <Button variant="ghost" className={arrow} disabled>
          <ChevronLeft />
          <span className="hidden sm:inline">前へ</span>
        </Button>
      )}
      <ul className="flex items-center gap-1">
        {pageWindow(page, pageCount).map((n, i) =>
          n === "gap" ? (
            <li key={`gap-${i}`} aria-hidden className="text-muted-foreground px-1">
              …
            </li>
          ) : (
            <li key={n}>
              <Button asChild variant={n === page ? "default" : "ghost"} className={cn("num size-10 rounded-full p-0")}>
                <Link href={href(n)} aria-current={n === page ? "page" : undefined} aria-label={`${n}ページ目`}>
                  {n}
                </Link>
              </Button>
            </li>
          ),
        )}
      </ul>
      {page < pageCount ? (
        <Button asChild variant="ghost" className={arrow}>
          <Link href={href(page + 1)}>
            <span className="hidden sm:inline">次へ</span>
            <ChevronRight />
          </Link>
        </Button>
      ) : (
        <Button variant="ghost" className={arrow} disabled>
          <span className="hidden sm:inline">次へ</span>
          <ChevronRight />
        </Button>
      )}
    </nav>
  );
}
