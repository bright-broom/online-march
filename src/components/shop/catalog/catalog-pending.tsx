"use client";
import { createContext, useContext, useTransition, type TransitionStartFunction } from "react";
import { cn } from "@/lib/utils";

const Ctx = createContext<{ pending: boolean; startTransition: TransitionStartFunction } | null>(null);

/** Shares one transition between the filters (writers) and the results frame (dims while loading). */
export function CatalogPendingProvider({ children }: { children: React.ReactNode }) {
  const [pending, startTransition] = useTransition();
  return <Ctx.Provider value={{ pending, startTransition }}>{children}</Ctx.Provider>;
}

export function useCatalogTransition() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCatalogTransition must be used inside <CatalogPendingProvider>");
  return ctx;
}

export function CatalogResultsFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  const { pending } = useCatalogTransition();
  return (
    <div
      aria-busy={pending}
      className={cn("transition-opacity duration-300", pending && "pointer-events-none opacity-50", className)}
    >
      {children}
    </div>
  );
}
