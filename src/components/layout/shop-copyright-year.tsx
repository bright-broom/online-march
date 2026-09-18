"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getYear = () => new Date().getFullYear();

/** Current year, resolved on the client (server render must not read the clock under Cache Components). */
export function ShopCopyrightYear() {
  const year = useSyncExternalStore(subscribe, getYear, () => null);
  return <span suppressHydrationWarning>{year ?? ""}</span>;
}
