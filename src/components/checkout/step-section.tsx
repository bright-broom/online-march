import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Numbered checkout step (editorial card). */
export function StepSection({
  step, title, description, done, action, children, className,
}: {
  step: number; title: string; description?: string; done?: boolean; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={cn("bg-card rounded-2xl border p-5 sm:p-7", className)} aria-labelledby={`step-${step}`}>
      <header className="mb-5 flex items-start gap-3">
        <span
          className={cn(
            "num flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
            done ? "bg-primary text-primary-foreground border-primary" : "text-primary border-primary/40",
          )}
          aria-hidden
        >
          {done ? <Check className="size-4" /> : step}
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <h2 id={`step-${step}`} className="heading-display text-lg sm:text-xl">{title}</h2>
          {description && <p className="text-muted-foreground text-sm">{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
