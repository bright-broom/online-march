import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Card with a quiet header for charts / tables in the admin console. */
export function PanelCard({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("gap-3", className)}>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}

/** KPI-sized tile for non-numeric values (text status, relative time). Mirrors StatCard's rhythm. */
export function InfoStat({ label, value, hint, icon: IconC, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: LucideIcon; className?: string }) {
  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)}>
      <CardContent className="space-y-3 p-5">
        <div className="text-muted-foreground flex items-center justify-between text-xs font-medium">
          <span>{label}</span>
          {IconC && <span className="bg-primary/10 text-primary rounded-lg p-1.5"><IconC className="size-4" /></span>}
        </div>
        <p className="text-xl font-semibold tracking-tight sm:text-2xl">{value}</p>
        {hint && <p className="text-muted-foreground truncate text-xs">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/** URL-driven segmented filter (server-rendered links; state lives in searchParams). */
export function FilterTabs({
  basePath,
  param,
  current,
  items,
  className,
}: {
  basePath: string;
  param: string;
  current: string;
  items: { value: string; label: string; count?: number }[];
  className?: string;
}) {
  return (
    <nav aria-label="絞り込み" className={cn("bg-muted/60 inline-flex max-w-full flex-wrap gap-1 rounded-xl p-1", className)}>
      {items.map((it) => {
        const active = it.value === current;
        const href = it.value === "all" ? basePath : `${basePath}?${new URLSearchParams({ [param]: it.value })}`;
        return (
          <Link
            key={it.value}
            href={href}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {it.label}
            {it.count != null && (
              <span className={cn("num rounded-full px-1.5 text-[10px] tabular-nums", active ? "bg-primary/12 text-primary" : "bg-background/70")}>
                {it.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Label / value rows for detail pages. */
export function DetailList({ rows, className }: { rows: [React.ReactNode, React.ReactNode][]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[7rem_1fr] gap-x-4 gap-y-2.5 text-sm", className)}>
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted-foreground text-xs leading-5">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ── skeletons (loading.tsx) ── */

export function HeaderSkeleton() {
  return (
    <div className="mb-6 space-y-2">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
    </div>
  );
}

export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-[132px] rounded-xl" />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-9 w-full max-w-xs" />
      <div className="bg-card space-y-2 rounded-xl border p-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

export function PageSkeleton({ kpis = 0, chart = false, rows = 8 }: { kpis?: number; chart?: boolean; rows?: number }) {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      {kpis > 0 && <KpiSkeleton count={kpis} />}
      {chart && <Skeleton className="h-80 rounded-xl" />}
      <TableSkeleton rows={rows} />
    </div>
  );
}
