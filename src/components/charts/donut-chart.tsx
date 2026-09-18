"use client";
import { Cell, Label, Pie, PieChart } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatValue } from "./format";
import { colorVar, type ChartColor, type ValueFormat } from "./types";

export type Slice = { key: string; label: string; value: number; color: ChartColor };

/** Donut with centered total. */
export default function DonutChart({ data, valueFormat = "number", height = 260, centerLabel = "合計" }: { data: Slice[]; valueFormat?: ValueFormat; height?: number; centerLabel?: string }) {
  const config = Object.fromEntries(data.map((d) => [d.key, { label: d.label, color: colorVar(d.color) }])) satisfies ChartConfig;
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <ChartContainer config={config} className="mx-auto aspect-auto w-full" style={{ height }}>
      <PieChart>
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey="key" valueFormatter={(v) => formatValue(v, valueFormat)} />} />
        <Pie data={data} dataKey="value" nameKey="key" innerRadius="58%" outerRadius="85%" strokeWidth={3} stroke="var(--card)" paddingAngle={1}>
          {data.map((d) => <Cell key={d.key} fill={`var(--color-${d.key})`} />)}
          <Label
            content={({ viewBox }) =>
              viewBox && "cx" in viewBox ? (
                <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                  <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) - 6} className="fill-foreground font-display text-lg font-semibold">{formatValue(total, valueFormat === "yen" ? "compactYen" : valueFormat)}</tspan>
                  <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 14} className="fill-muted-foreground text-[11px]">{centerLabel}</tspan>
                </text>
              ) : null
            }
          />
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="key" className="flex-wrap gap-x-3 gap-y-1" />} />
      </PieChart>
    </ChartContainer>
  );
}
