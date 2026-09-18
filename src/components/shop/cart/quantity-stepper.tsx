"use client";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** − n + stepper. 44px tap targets on touch screens (docs/DESIGN.md §7). */
export function QuantityStepper({
  value,
  min = 1,
  max,
  onChange,
  label,
  size = "md",
  className,
}: {
  value: number;
  min?: number;
  max: number;
  onChange: (n: number) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const btn = cn(
    "text-foreground hover:bg-muted focus-visible:ring-ring/50 inline-flex items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-35",
    size === "sm" ? "size-11 sm:size-8" : "size-11",
  );
  return (
    <div
      role="group"
      aria-label={`${label}の数量`}
      className={cn("bg-background inline-flex items-center rounded-full border", className)}
    >
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label="1つ減らす">
        <Minus className="size-3.5" />
      </button>
      <output aria-live="polite" className={cn("num text-center text-sm font-semibold tabular-nums", size === "sm" ? "w-7" : "w-10")}>
        {value}
      </output>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="1つ増やす">
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
