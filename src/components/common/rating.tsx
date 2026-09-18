import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function RatingStars({ value, size = 14, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`評価 ${value.toFixed(1)} / 5`}>
      {Array.from({ length: 5 }, (_, i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star className="text-muted-foreground/30 absolute inset-0" style={{ width: size, height: size }} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className="fill-primary text-primary" style={{ width: size, height: size }} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** ★4.8 (123) compact summary from denormalized sum/count. */
export function RatingSummary({ sum, count, className }: { sum: number; count: number; className?: string }) {
  if (!count) return <span className={cn("text-muted-foreground text-xs", className)}>レビューなし</span>;
  const avg = sum / count;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)}>
      <RatingStars value={avg} size={12} />
      <span className="num font-semibold">{avg.toFixed(1)}</span>
      <span className="text-muted-foreground">({count})</span>
    </span>
  );
}
