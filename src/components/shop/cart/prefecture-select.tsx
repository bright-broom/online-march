"use client";
import { MapPin } from "lucide-react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { shippingZones, type Prefecture } from "@/config/shipping";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";
import { useShippingPrefs } from "@/stores/cart";

/** Estimate destination (remembered in localStorage). Renders a placeholder until hydrated. */
export function PrefectureSelect({ className, id }: { className?: string; id?: string }) {
  const hydrated = useHydrated();
  const prefecture = useShippingPrefs((s) => s.prefecture);
  const setPrefecture = useShippingPrefs((s) => s.setPrefecture);
  if (!hydrated) return <Skeleton className={cn("h-9 w-32 rounded-full", className)} />;
  return (
    <Select value={prefecture} onValueChange={(v) => setPrefecture(v as Prefecture)}>
      <SelectTrigger id={id} aria-label="お届け先の都道府県" className={cn("bg-background h-9 rounded-full pr-3 pl-3", className)}>
        <MapPin className="text-primary size-3.5" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-80">
        {Object.entries(shippingZones).map(([key, zone]) => (
          <SelectGroup key={key}>
            <SelectLabel>{zone.label}</SelectLabel>
            {zone.prefectures.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
