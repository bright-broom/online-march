import { cn } from "@/lib/utils";

/** Editorial section heading: eyebrow (latin caps) + mincho title + lead. */
export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = "left",
  action,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  align?: "left" | "center";
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", align === "center" && "items-center text-center sm:flex-col sm:items-center", className)}>
      <div className={cn("max-w-2xl space-y-3", align === "center" && "mx-auto")}>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="heading-display text-2xl sm:text-3xl lg:text-4xl">{title}</h2>
        {lead && <p className="text-muted-foreground text-sm leading-relaxed sm:text-base">{lead}</p>}
      </div>
      {action}
    </div>
  );
}
