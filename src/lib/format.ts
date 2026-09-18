/** Display formatters. Always use these — never format money/dates inline. */
const yenFmt = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });
const numFmt = new Intl.NumberFormat("ja-JP");
const compactFmt = new Intl.NumberFormat("ja-JP", { notation: "compact", maximumFractionDigits: 1 });

export const formatYen = (n: number) => yenFmt.format(n);
/** 1,234円 style (for editorial layouts) */
export const formatYenJa = (n: number) => `${numFmt.format(n)}円`;
export const formatNumber = (n: number) => numFmt.format(n);
export const formatCompact = (n: number) => compactFmt.format(n);
export const formatPercent = (ratio: number, digits = 1) => `${(ratio * 100).toFixed(digits)}%`;
export const formatWeight = (grams: number) =>
  grams >= 1000 ? `${Number((grams / 1000).toFixed(1))}kg` : `${grams}g`;

const TZ = "Asia/Tokyo";
const dateFmt = new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, year: "numeric", month: "long", day: "numeric" });
const shortDateFmt = new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, month: "numeric", day: "numeric", weekday: "short" });
const dateTimeFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});

type DateLike = Date | string | number | null | undefined;
const toDate = (d: DateLike) => (d == null ? null : d instanceof Date ? d : new Date(d));

export const formatDate = (d: DateLike) => { const x = toDate(d); return x ? dateFmt.format(x) : "—"; };
export const formatShortDate = (d: DateLike) => { const x = toDate(d); return x ? shortDateFmt.format(x) : "—"; };
export const formatDateTime = (d: DateLike) => { const x = toDate(d); return x ? dateTimeFmt.format(x) : "—"; };

export function formatRelative(d: DateLike, now: Date) {
  const x = toDate(d);
  if (!x) return "—";
  const diff = (x.getTime() - now.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("ja", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return formatDate(x);
}

export const formatRating = (sum: number, count: number) => (count ? (sum / count).toFixed(1) : "—");
export const ratingAvg = (sum: number, count: number) => (count ? sum / count : 0);
export const formatPostalCode = (p: string) => (/^\d{7}$/.test(p) ? `${p.slice(0, 3)}-${p.slice(3)}` : p);
