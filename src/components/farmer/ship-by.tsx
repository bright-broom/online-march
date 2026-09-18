import { ToneBadge } from "@/components/common/status-badge";
import type { Tone } from "@/config/status";
import { diffDays, fromYmd, type YMD } from "@/lib/dates";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ShipUrgency = "overdue" | "today" | "tomorrow" | "later";

export const shipUrgencyMeta: Record<ShipUrgency, { label: string; tone: Tone; description: string }> = {
  overdue: { label: "期限超過", tone: "danger", description: "出荷期限を過ぎています。できるだけ早く発送してください" },
  today: { label: "本日出荷", tone: "warning", description: "今日が出荷期限です" },
  tomorrow: { label: "明日出荷", tone: "brand", description: "明日が出荷期限です" },
  later: { label: "明後日以降", tone: "neutral", description: "余裕をもって準備できます" },
};

export function shipUrgency(shipByDate: YMD | null, today: YMD): ShipUrgency {
  if (!shipByDate) return "later";
  const d = diffDays(shipByDate, today);
  return d < 0 ? "overdue" : d === 0 ? "today" : d === 1 ? "tomorrow" : "later";
}

/** 出荷期限 with urgency color. `today` is a JST YMD passed from the server. */
export function ShipByBadge({ shipByDate, today, className }: { shipByDate: YMD | null; today: YMD; className?: string }) {
  if (!shipByDate) return <span className="text-muted-foreground text-xs">—</span>;
  const u = shipUrgency(shipByDate, today);
  if (u === "later") return <span className={cn("text-xs tabular-nums", className)}>{formatShortDate(fromYmd(shipByDate))}</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="text-xs tabular-nums">{formatShortDate(fromYmd(shipByDate))}</span>
      <ToneBadge tone={shipUrgencyMeta[u].tone} className="px-1.5 py-0 text-[10px]">{shipUrgencyMeta[u].label}</ToneBadge>
    </span>
  );
}
