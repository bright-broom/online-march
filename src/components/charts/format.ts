import { formatCompact, formatNumber, formatYen } from "@/lib/format";
import type { ValueFormat } from "./types";

export function formatValue(v: unknown, f: ValueFormat = "number") {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v ?? "");
  switch (f) {
    case "yen": return formatYen(n);
    case "compactYen": return `¥${formatCompact(n)}`;
    case "percent": return `${(n * 100).toFixed(1)}%`;
    default: return formatNumber(n);
  }
}
