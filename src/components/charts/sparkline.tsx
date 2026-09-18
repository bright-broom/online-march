"use client";
import { Area, AreaChart } from "recharts";
import { colorVar, type ChartColor } from "./types";

/** Tiny inline trend for KPI cards. No axes/tooltip. */
export default function Sparkline({ values, color = "primary", height = 36 }: { values: number[]; color?: ChartColor; height?: number }) {
  const data = values.map((v, i) => ({ i, v }));
  const id = `spark-${color}`;
  return (
    <div style={{ height }} className="w-full">
      <AreaChart width={120} height={height} data={data} style={{ width: "100%", height }} responsive>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colorVar(color)} stopOpacity={0.35} />
            <stop offset="100%" stopColor={colorVar(color)} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area dataKey="v" type="monotone" stroke={colorVar(color)} strokeWidth={1.75} fill={`url(#${id})`} isAnimationActive={false} />
      </AreaChart>
    </div>
  );
}
