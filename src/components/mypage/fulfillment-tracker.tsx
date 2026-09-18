import { Check } from "lucide-react";
import { farmOrderStatusMeta, fulfillmentSteps } from "@/config/status";
import type { FarmOrderStatus } from "@/db/schema";
import { cn } from "@/lib/utils";

/** Horizontal progress tracker: 受注 → 出荷準備 → 発送 → 配達完了 (labels from config/status). */
export function FulfillmentTracker({ status, className, compact = false }: { status: FarmOrderStatus; className?: string; compact?: boolean }) {
  const current = farmOrderStatusMeta[status].step;
  if (current < 0) {
    return (
      <p className={cn("text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 text-xs", className)}>
        このご注文は「{farmOrderStatusMeta[status].label}」です
      </p>
    );
  }
  return (
    <ol className={cn("grid", className)} style={{ gridTemplateColumns: `repeat(${fulfillmentSteps.length}, minmax(0, 1fr))` }} aria-label="配送状況">
      {fulfillmentSteps.map((s, i) => {
        const meta = farmOrderStatusMeta[s];
        const done = meta.step <= current;
        const active = meta.step === current;
        return (
          <li key={s} className="relative flex flex-col items-center gap-1.5 text-center" aria-current={active ? "step" : undefined}>
            {i > 0 && (
              <span
                aria-hidden
                className={cn("absolute top-3 right-1/2 h-0.5 w-full -translate-y-1/2", done ? "bg-primary" : "bg-border")}
              />
            )}
            <span
              className={cn(
                "relative z-10 flex size-6 items-center justify-center rounded-full border-2 text-[10px] font-semibold transition-colors",
                done ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground",
                active && "ring-primary/20 ring-4",
              )}
            >
              {done && !active ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("text-[11px] leading-tight", active ? "text-foreground font-semibold" : "text-muted-foreground")}>
              {meta.label}
            </span>
            {!compact && active && meta.description && (
              <span className="text-muted-foreground hidden text-[10px] leading-tight sm:block">{meta.description}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
