"use client";
/**
 * Lazy chart entrypoints — import charts ONLY from here.
 * Recharts (~100KB gz) is split out of the initial bundle and loaded after hydration,
 * with a skeleton of the exact height to avoid layout shift.
 */
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const fallback = (h: number) => {
  function ChartSkeleton() {
    return <Skeleton className="w-full rounded-xl" style={{ height: h }} />;
  }
  return ChartSkeleton;
};

export const TrendChart = dynamic(() => import("./trend-chart"), { ssr: false, loading: fallback(280) });
export const BarBreakdownChart = dynamic(() => import("./bar-chart"), { ssr: false, loading: fallback(280) });
export const DonutChart = dynamic(() => import("./donut-chart"), { ssr: false, loading: fallback(260) });
export const Sparkline = dynamic(() => import("./sparkline"), { ssr: false, loading: fallback(36) });

export type { Series, Datum, ChartColor, ValueFormat } from "./types";
export type { Slice } from "./donut-chart";
