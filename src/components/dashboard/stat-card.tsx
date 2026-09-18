import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Sparkline, type ChartColor } from "@/components/charts";
import { Card, CardContent } from "@/components/ui/card";
import { formatCompact, formatNumber, formatYen } from "@/lib/format";
import { cn } from "@/lib/utils";

/** KPI tile: value + delta vs previous period + optional sparkline. */
export function StatCard({
  label, value, format = "number", delta, icon: IconC, trend, color = "primary", hint, className,
}: {
  label: string; value: number | null; format?: "yen" | "number" | "compact" | "percent"; delta?: number | null;
  icon?: LucideIcon; trend?: number[]; color?: ChartColor; hint?: string; className?: string;
}) {
  const display = value == null ? "—" : format === "yen" ? formatYen(value) : format === "compact" ? formatCompact(value) : format === "percent" ? `${(value * 100).toFixed(1)}%` : formatNumber(value);
  const up = (delta ?? 0) >= 0;
  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)}>
      <CardContent className="space-y-3 p-5">
        <div className="text-muted-foreground flex items-center justify-between text-xs font-medium">
          <span>{label}</span>
          {IconC && <span className="bg-primary/10 text-primary rounded-lg p-1.5"><IconC className="size-4" /></span>}
        </div>
        <p className="num text-2xl font-semibold tracking-tight sm:text-[28px]">{display}</p>
        <div className="flex items-end justify-between gap-3">
          <div className="text-xs">
            {delta != null && Number.isFinite(delta) && (
              <span className={cn("inline-flex items-center gap-0.5 font-semibold", up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                {Math.abs(delta * 100).toFixed(1)}%
              </span>
            )}
            {hint && <span className="text-muted-foreground ml-1.5">{hint}</span>}
          </div>
          {trend && trend.length > 1 && <div className="w-24"><Sparkline values={trend} color={color} /></div>}
        </div>
      </CardContent>
    </Card>
  );
}
