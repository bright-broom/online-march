/**
 * Admin-console vocabularies not (yet) present in src/config.
 * TODO(integration): promote to `src/config/admin.ts` (shared config) — see final report.
 */
import type { Tone } from "@/config/status";
import type { UserRole } from "@/db/schema/auth";

export const roleMeta: Record<UserRole, { label: string; tone: Tone }> = {
  customer: { label: "購入者", tone: "neutral" },
  farmer: { label: "生産者", tone: "brand" },
  admin: { label: "運営", tone: "info" },
};

export const audienceMeta: Record<"all" | "customer" | "farmer", { label: string; tone: Tone }> = {
  all: { label: "全員", tone: "brand" },
  customer: { label: "購入者", tone: "neutral" },
  farmer: { label: "生産者", tone: "info" },
};

export const couponTypeMeta: Record<"percent" | "fixed", { label: string; unit: string }> = {
  percent: { label: "定率（%）", unit: "%" },
  fixed: { label: "定額（円）", unit: "円" },
};

export const paymentProviderMeta: Record<string, { label: string; tone: Tone }> = {
  stripe: { label: "Stripe", tone: "info" },
  demo: { label: "デモ決済", tone: "neutral" },
};

export const jobTriggerMeta: Record<"cron" | "manual" | "webhook", { label: string; tone: Tone }> = {
  cron: { label: "Cron", tone: "neutral" },
  manual: { label: "手動", tone: "brand" },
  webhook: { label: "Webhook", tone: "info" },
};

export const jobStatusMeta: Record<"success" | "error", { label: string; tone: Tone }> = {
  success: { label: "成功", tone: "success" },
  error: { label: "失敗", tone: "danger" },
};

export const periodOptions = [
  { days: 7, label: "7日" },
  { days: 30, label: "30日" },
  { days: 90, label: "90日" },
] as const;

/** 0=Sun … 6=Sat (farms.shipWeekdays) */
export const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** shipment_events.source */
export const eventSourceLabels: Record<string, string> = {
  system: "システム",
  farmer: "生産者",
  admin: "運営",
  customer: "お客さま",
  cron: "自動",
  carrier: "配送業者",
};

/** job_runs.summary keys → 日本語 (unknown keys are shown as-is). */
export const jobSummaryLabels: Record<string, string> = {
  cancelled: "キャンセル",
  farms: "対象生産者",
  orders: "対象注文",
  checked: "確認",
  delivered: "配達完了",
  sent: "送信",
  created: "精算作成",
  transferred: "送金",
  awaitingManual: "手動振込待ち",
  processed: "処理",
  error: "エラー",
};
export const formatJobSummary = (summary: Record<string, unknown>) =>
  Object.entries(summary)
    .map(([k, v]) => `${jobSummaryLabels[k] ?? k} ${typeof v === "number" ? `${v}件` : String(v)}`)
    .join("・") || "処理対象なし";

export type CouponPhase = "active" | "scheduled" | "expired" | "exhausted" | "inactive";
export const couponPhaseMeta: Record<CouponPhase, { label: string; tone: Tone }> = {
  active: { label: "利用可能", tone: "success" },
  scheduled: { label: "開始前", tone: "info" },
  expired: { label: "期限切れ", tone: "neutral" },
  exhausted: { label: "上限到達", tone: "warning" },
  inactive: { label: "停止中", tone: "neutral" },
};
export function couponPhase(c: { isActive: boolean; startsAt: Date | null; endsAt: Date | null; maxUses: number | null; usedCount: number }, now: Date): CouponPhase {
  if (!c.isActive) return "inactive";
  if (c.endsAt && c.endsAt < now) return "expired";
  if (c.maxUses != null && c.usedCount >= c.maxUses) return "exhausted";
  if (c.startsAt && c.startsAt > now) return "scheduled";
  return "active";
}
