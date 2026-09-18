"use client";
import { useSyncExternalStore } from "react";

/** true after hydration — use to render localStorage-backed UI (cart) without mismatch. */
export function useHydrated() {
  return useSyncExternalStore(() => () => {}, () => true, () => false);
}
