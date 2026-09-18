"use client";
import { useEffect } from "react";
import { create } from "zustand";

/**
 * Per-visitor engagement state (favorites / follows) for the public storefront.
 * Static pages render hearts/follow buttons in a neutral state; <EngagementHydrator>
 * (a Suspense-wrapped server component in the shop layout) streams the real ids in.
 */
type Status = "unknown" | "guest" | "user";

type EngagementState = {
  status: Status;
  favorites: Set<string>;
  follows: Set<string>;
  hydrate: (s: { status: Exclude<Status, "unknown">; favorites: string[]; follows: string[] }) => void;
  setFavorite: (productId: string, on: boolean) => void;
  setFollow: (farmId: string, on: boolean) => void;
};

export const useEngagement = create<EngagementState>()((set) => ({
  status: "unknown",
  favorites: new Set(),
  follows: new Set(),
  hydrate: ({ status, favorites, follows }) => set({ status, favorites: new Set(favorites), follows: new Set(follows) }),
  setFavorite: (id, on) =>
    set((s) => {
      const next = new Set(s.favorites);
      if (on) next.add(id);
      else next.delete(id);
      return { favorites: next };
    }),
  setFollow: (id, on) =>
    set((s) => {
      const next = new Set(s.follows);
      if (on) next.add(id);
      else next.delete(id);
      return { follows: next };
    }),
}));

export function EngagementSync({
  signedIn,
  favorites,
  follows,
}: {
  signedIn: boolean;
  favorites: string[];
  follows: string[];
}) {
  const hydrate = useEngagement((s) => s.hydrate);
  const key = `${signedIn}|${favorites.join(",")}|${follows.join(",")}`;
  useEffect(() => {
    hydrate({ status: signedIn ? "user" : "guest", favorites, follows });
    // `key` captures the array contents; arrays are new references on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hydrate]);
  return null;
}

/** `/login?next=<current path>` built at click time (avoids usePathname → no Suspense needed). */
export function loginHrefForHere(loginPath: string) {
  const here = typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}`;
  return `${loginPath}?next=${encodeURIComponent(here)}`;
}
