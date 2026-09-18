"use client";
import { CircleDot, Save } from "lucide-react";
import { SubmitButton } from "@/components/common/submit-button";
import { cn } from "@/lib/utils";

/** Sticky bottom save bar for long forms (thumb-reachable on phones). Place as the last child of the <form>. */
export function StickySaveBar({
  dirty, pending, label = "保存する", children, className,
}: { dirty: boolean; pending?: boolean; label?: string; children?: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "bg-background/90 sticky bottom-0 z-20 -mx-4 mt-6 flex items-center justify-between gap-3 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md md:-mx-6 md:px-6 lg:-mx-8 lg:px-8",
        className,
      )}
    >
      <p className={cn("flex items-center gap-1.5 text-xs", dirty ? "text-primary" : "text-muted-foreground")} aria-live="polite">
        {dirty ? <><CircleDot className="size-3.5" />未保存の変更があります</> : "変更はすべて保存されています"}
      </p>
      <div className="flex items-center gap-2">
        {children}
        <SubmitButton pending={pending} size="lg" className="min-w-32 rounded-full">
          {!pending && <Save />}
          {label}
        </SubmitButton>
      </div>
    </div>
  );
}
