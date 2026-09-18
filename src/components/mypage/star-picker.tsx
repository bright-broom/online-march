"use client";
import { Star } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const hints = ["", "いまひとつ", "ふつう", "よかった", "とてもよかった", "最高においしい"];

/** Accessible 1–5 star picker (radiogroup). Writes the value to a hidden input `name`. */
export function StarPicker({ name, value, onChange, invalid }: { name: string; value: number; onChange: (v: number) => void; invalid?: boolean }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-3">
      <input type="hidden" name={name} value={value || ""} />
      <div role="radiogroup" aria-label="評価" aria-invalid={invalid || undefined} className="flex" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n}つ星`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            onClick={() => onChange(n)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); onChange(Math.min(5, (value || 0) + 1)); }
              if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); onChange(Math.max(1, (value || 2) - 1)); }
            }}
            className="focus-visible:ring-ring/50 rounded-md p-1 outline-none focus-visible:ring-3"
          >
            <Star
              className={cn(
                "size-7 transition-colors",
                n <= shown ? "fill-primary text-primary" : "text-muted-foreground/40",
              )}
            />
          </button>
        ))}
      </div>
      <span className="text-muted-foreground min-w-[6rem] text-sm">{hints[shown]}</span>
    </div>
  );
}
