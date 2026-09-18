import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Price with optional strike-through compare price and discount %. Tax-inclusive by default. */
export function Price({
  amount,
  compareAt,
  size = "md",
  showTax = true,
  className,
}: {
  amount: number;
  compareAt?: number | null;
  size?: "sm" | "md" | "lg" | "xl";
  showTax?: boolean;
  className?: string;
}) {
  const discount = compareAt && compareAt > amount ? Math.round((1 - amount / compareAt) * 100) : 0;
  const sizes = { sm: "text-sm", md: "text-base", lg: "text-xl", xl: "text-3xl" };
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2", className)}>
      <span className={cn("num font-semibold tracking-tight", sizes[size])}>
        {formatNumber(amount)}
        <span className="ml-0.5 text-[0.7em] font-normal">円</span>
      </span>
      {showTax && <span className="text-muted-foreground text-[11px]">税込</span>}
      {discount > 0 && (
        <>
          <s className="text-muted-foreground num text-xs">{formatNumber(compareAt!)}円</s>
          <span className="text-destructive text-xs font-semibold">{discount}%OFF</span>
        </>
      )}
    </span>
  );
}
