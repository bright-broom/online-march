import { comparePricePolicy } from "@/config/catalog";

/**
 * 「通常価格」を打ち消し表示してよいか（#11）。記録（公開していた期間ごとの価格）だけから決める純関数。
 * - 値下げの始まり S = 通常価格で最後に販売していた期間が終わったあと、最初に公開した時点（非公開をはさんでも、
 *   値下げ中に価格を変えても S は動かない＝公開し直しで8週間の上限を逃れられない）
 * - [S − lookback, S] の間に通常価格で公開していた時間が lookback の過半を超えること
 * - 通常価格で最後に販売していた時点から S までが maxGapDays 以内であること
 * - 今が S から maxSaleDays 以内であること
 */
export type PricePeriod = { price: number; startedAt: Date; endedAt: Date | null };
export type CompareVerdict = { ok: boolean; reason: keyof typeof comparePricePolicy.reasons };

const DAY = 86_400_000;

export function compareAtVerdict(periods: PricePeriod[], v: { price: number; compareAt: number | null }, now: Date): CompareVerdict {
  const P = comparePricePolicy;
  if (v.compareAt == null || v.compareAt <= v.price) return { ok: false, reason: "noRecord" };
  const sorted = [...periods].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const open = sorted.find((p) => p.endedAt == null);
  if (!open || open.price !== v.price) return { ok: false, reason: "notListed" };

  const reference = sorted.filter((p) => p.price === v.compareAt && p.endedAt != null);
  if (!reference.length) return { ok: false, reason: "noRecord" };
  const lastRefEnd = Math.max(...reference.map((p) => p.endedAt!.getTime()));
  const saleStart = sorted.find((p) => p.startedAt.getTime() >= lastRefEnd)?.startedAt.getTime();
  if (saleStart == null) return { ok: false, reason: "noRecord" };

  const windowStart = saleStart - P.lookbackDays * DAY;
  const referenceMs = reference.reduce((a, p) => {
    const from = Math.max(p.startedAt.getTime(), windowStart);
    const to = Math.min(p.endedAt!.getTime(), saleStart);
    return a + Math.max(0, to - from);
  }, 0);
  if (referenceMs <= P.lookbackDays * DAY * P.minReferenceShare) return { ok: false, reason: "tooShort" };
  if (saleStart - lastRefEnd > P.maxGapDays * DAY) return { ok: false, reason: "gapTooLong" };
  if (now.getTime() - saleStart > P.maxSaleDays * DAY) return { ok: false, reason: "saleTooLong" };
  return { ok: true, reason: "shown" };
}
