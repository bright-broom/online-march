import { cn } from "@/lib/utils";

/** Section heading: mincho title + lead. 英字の小見出し（eyebrow）は置かない（docs/DESIGN.md §8） */
export function SectionHeading({
  title,
  lead,
  align = "left",
  action,
  className,
}: {
  title: React.ReactNode;
  lead?: React.ReactNode;
  align?: "left" | "center";
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", align === "center" && "items-center text-center sm:flex-col sm:items-center", className)}>
      <div className={cn("max-w-2xl space-y-3", align === "center" && "mx-auto")}>
        <h2 className="heading-display text-2xl sm:text-3xl lg:text-4xl">{title}</h2>
        {lead && <p className="text-muted-foreground text-sm leading-relaxed sm:text-base">{lead}</p>}
      </div>
      {action}
    </div>
  );
}
