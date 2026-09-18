"use client";
import { useState } from "react";
import { TrendChart } from "@/components/charts";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { FarmAnalytics } from "@/server/queries/farmer";

/** 売上推移 (last 90 days) with 日別 / 週別 toggle. */
export function SalesTrendCard({ daily, weekly }: { daily: FarmAnalytics["daily"]; weekly: FarmAnalytics["weekly"] }) {
  const [mode, setMode] = useState<"daily" | "weekly">("daily");
  return (
    <Card>
      <CardHeader>
        <CardTitle>売上推移</CardTitle>
        <CardDescription>直近90日・商品代金（送料を除く）</CardDescription>
        <CardAction>
          <ToggleGroup type="single" size="sm" variant="outline" spacing={0} value={mode} onValueChange={(v) => v && setMode(v as typeof mode)}>
            <ToggleGroupItem value="daily" className="px-3 text-xs">日別</ToggleGroupItem>
            <ToggleGroupItem value="weekly" className="px-3 text-xs">週別</ToggleGroupItem>
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent>
        <TrendChart
          data={mode === "daily" ? daily : weekly}
          xKey="label"
          series={[{ key: "sales", label: "売上", color: "chart-1" }]}
          valueFormat="yen"
          height={280}
        />
      </CardContent>
    </Card>
  );
}
