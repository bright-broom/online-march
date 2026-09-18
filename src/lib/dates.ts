/**
 * JST calendar-date helpers. Business dates (ship-by, delivery) are `YYYY-MM-DD` strings in JST.
 * Pure: callers pass `now` explicitly (Cache Components forbids implicit Date.now() in prerender).
 */
const TZ = "Asia/Tokyo";
const ymdFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

export type YMD = string; // "2026-09-18"

export const toYmd = (d: Date): YMD => ymdFmt.format(d);

/** Parse YMD as JST midnight. */
export const fromYmd = (ymd: YMD) => new Date(`${ymd}T00:00:00+09:00`);

export const addDays = (ymd: YMD, days: number): YMD => {
  const d = fromYmd(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return toYmd(d);
};

/** 0=Sun … 6=Sat in JST */
export const weekday = (ymd: YMD) => new Date(`${ymd}T12:00:00+09:00`).getUTCDay();

export const diffDays = (a: YMD, b: YMD) => Math.round((fromYmd(a).getTime() - fromYmd(b).getTime()) / 86_400_000);

/** Next date (>= from) whose weekday is in `allowed`. */
export function nextAllowedDay(from: YMD, allowed: readonly number[]): YMD {
  if (!allowed.length) return from;
  let d = from;
  for (let i = 0; i < 14; i++) {
    if (allowed.includes(weekday(d))) return d;
    d = addDays(d, 1);
  }
  return from;
}

export const monthKey = (d: Date) => toYmd(d).slice(0, 7); // "2026-09"
export const startOfMonthYmd = (d: Date) => `${monthKey(d)}-01`;
