import { SectionHeading } from "@/components/common/section-heading";
import { months } from "@/config/catalog";
import { homeContent, onionCalendar } from "@/config/content";
import { cn } from "@/lib/utils";
import { CurrentMonthColumn } from "./current-month";

/** chart-N token → class (literal strings so Tailwind can see them). */
const toneBg: Record<string, string> = {
  "chart-1": "bg-chart-1",
  "chart-2": "bg-chart-2",
  "chart-3": "bg-chart-3",
  "chart-4": "bg-chart-4",
  "chart-5": "bg-chart-5",
};

const LABEL_COL = "sm:grid-cols-[12rem_1fr]";

/** 玉ねぎカレンダー: month grid with a bar per onion type. Current month is highlighted client-side. */
export function OnionCalendar() {
  const { calendar } = homeContent;
  return (
    <section className="bg-paper">
      <div className="container-page py-16 sm:py-24">
        <SectionHeading eyebrow={calendar.eyebrow} title={calendar.title} lead={calendar.lead} />
        <div className="bg-background mt-10 rounded-3xl border p-5 sm:p-8">
          <div className={cn("relative grid gap-y-5", LABEL_COL)}>
            {/* month header */}
            <div className="hidden sm:block" />
            <ol className="grid grid-cols-12 text-center" aria-hidden>
              {months.map((m) => (
                <li key={m.value} className="num text-muted-foreground text-[10px] sm:text-xs">
                  {m.value}
                  <span className="hidden md:inline">月</span>
                </li>
              ))}
            </ol>

            {onionCalendar.map((row) => (
              <div key={row.label} className={cn("col-span-full grid items-center gap-y-2", LABEL_COL)}>
                <p className="text-sm font-medium sm:pr-4">{row.label}</p>
                <div className="relative grid h-9 grid-cols-12 items-center">
                  <span aria-hidden className="bg-muted absolute inset-x-0 top-1/2 h-px" />
                  <span
                    className={cn("relative z-10 h-3 rounded-full sm:h-3.5", toneBg[row.tone] ?? "bg-primary")}
                    style={{ gridColumn: `${row.from} / ${row.to + 1}` }}
                  />
                  <span className="sr-only">
                    {row.from}月〜{row.to}月
                  </span>
                </div>
              </div>
            ))}

            {/* current month overlay (client) */}
            <div aria-hidden className={cn("pointer-events-none absolute inset-0 grid", LABEL_COL)}>
              <div className="hidden sm:block" />
              <div className="grid grid-cols-12">
                <CurrentMonthColumn />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
