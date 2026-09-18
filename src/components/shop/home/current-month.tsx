"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
/** JST month (1-12) — the storefront's calendar is Japan-local regardless of the viewer's TZ. */
const getMonth = () =>
  Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", month: "numeric" }).format(new Date()));

/** Highlights the current month column in the onion calendar (client clock, after hydration). */
export function CurrentMonthColumn() {
  const month = useSyncExternalStore(subscribe, getMonth, () => null);
  if (!month) return null;
  return (
    <div
      className="border-primary/40 bg-primary/8 relative -my-2 rounded-xl border border-dashed motion-safe:animate-in motion-safe:fade-in"
      style={{ gridColumn: `${month} / ${month + 1}`, gridRow: "1 / -1" }}
    >
      <span className="bg-primary text-primary-foreground absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] leading-none font-semibold whitespace-nowrap">
        いま
      </span>
    </div>
  );
}
