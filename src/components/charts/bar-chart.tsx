"use client";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatValue } from "./format";
import { colorVar, type Datum, type Series, type ValueFormat } from "./types";

/** Vertical or horizontal bars; multiple series side-by-side or stacked. */
export default function BarBreakdownChart({
  data, xKey, series, valueFormat = "number", height = 280, layout = "vertical-bars", stacked = false,
}: { data: Datum[]; xKey: string; series: Series[]; valueFormat?: ValueFormat; height?: number; layout?: "vertical-bars" | "horizontal-bars"; stacked?: boolean }) {
  const config = Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: colorVar(s.color) }])) satisfies ChartConfig;
  const horizontal = layout === "horizontal-bars";
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={horizontal} horizontal={!horizontal} strokeDasharray="3 3" />
        {horizontal ? (
          <>
            <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v) => formatValue(v, valueFormat === "yen" ? "compactYen" : valueFormat)} />
            <YAxis type="category" dataKey={xKey} tickLine={false} axisLine={false} width={120} tick={{ fontSize: 11 }} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v) => formatValue(v, valueFormat === "yen" ? "compactYen" : valueFormat)} />
          </>
        )}
        <ChartTooltip cursor={false} content={<ChartTooltipContent valueFormatter={(v) => formatValue(v, valueFormat)} />} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} fill={`var(--color-${s.key})`} radius={stacked && i < series.length - 1 ? 0 : horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]} stackId={stacked ? "a" : undefined} maxBarSize={36} />
        ))}
        {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
      </BarChart>
    </ChartContainer>
  );
}
