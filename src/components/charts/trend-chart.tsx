"use client";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatValue } from "./format";
import { colorVar, type Datum, type Series, type ValueFormat } from "./types";

/** Smooth area trend (time series). */
export default function TrendChart({
  data, xKey, series, valueFormat = "number", height = 280, stacked = false, showLegend = series.length > 1,
}: { data: Datum[]; xKey: string; series: Series[]; valueFormat?: ValueFormat; height?: number; stacked?: boolean; showLegend?: boolean }) {
  const config = Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: colorVar(s.color) }])) satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={`var(--color-${s.key})`} stopOpacity={0.35} />
              <stop offset="95%" stopColor={`var(--color-${s.key})`} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v) => formatValue(v, valueFormat === "yen" ? "compactYen" : valueFormat)} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" valueFormatter={(v) => formatValue(v, valueFormat)} />} />
        {series.map((s) => (
          <Area key={s.key} dataKey={s.key} type="monotone" fill={`url(#fill-${s.key})`} stroke={`var(--color-${s.key})`} strokeWidth={2} stackId={stacked ? "a" : undefined} />
        ))}
        {showLegend && <ChartLegend content={<ChartLegendContent />} />}
      </AreaChart>
    </ChartContainer>
  );
}
