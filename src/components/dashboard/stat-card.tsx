import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCompact, formatNumber, formatYen } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * KPI tile: label + value + delta vs previous period.
 * アイコンの箱と小さな折れ線は付けない（docs/DESIGN.md §8 D-03。推移は各画面のグラフで見せる）。
 */
export function StatCard({
  label, value, format = "number", delta, hint, className,
}: {
  label: string; value: number | null; format?: "yen" | "number" | "compact" | "percent"; delta?: number | null;
  hint?: string; className?: string;
}) {
  const display = value == null ? "—" : format === "yen" ? formatYen(value) : format === "compact" ? formatCompact(value) : format === "percent" ? `${(value * 100).toFixed(1)}%` : formatNumber(value);
  const up = (delta ?? 0) >= 0;
  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)}>
      <CardContent className="space-y-3 p-5">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <p className="num text-2xl font-semibold tracking-tight sm:text-[28px]">{display}</p>
        <div className="text-xs">
            {delta != null && Number.isFinite(delta) && (
              <span className={cn("inline-flex items-center gap-0.5 font-semibold", up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                {Math.abs(delta * 100).toFixed(1)}%
              </span>
            )}
            {hint && <span className="text-muted-foreground ml-1.5">{hint}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
