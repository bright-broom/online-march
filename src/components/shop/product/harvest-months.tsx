import { months } from "@/config/catalog";
import { cn } from "@/lib/utils";

/** Is month `m` within from..to (supports wrap-around, e.g. 11→2). */
const inSeason = (m: number, from: number, to: number) => (from <= to ? m >= from && m <= to : m >= from || m <= to);

export function HarvestMonths({ from, to, className }: { from: number | null; to: number | null; className?: string }) {
  if (!from || !to) return null;
  return (
    <div className={className}>
      <ol className="grid grid-cols-12 gap-1" aria-label={`収穫・出荷時期 ${from}月〜${to}月`}>
        {months.map((m) => {
          const on = inSeason(m.value, from, to);
          return (
            <li key={m.value} className="flex flex-col items-center gap-1.5">
              <span className={cn("h-2 w-full rounded-full", on ? "bg-chart-1" : "bg-muted")} />
              <span className={cn("num text-[10px]", on ? "text-foreground font-semibold" : "text-muted-foreground")}>{m.value}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
