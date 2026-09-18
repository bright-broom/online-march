"use client";
import { CalendarDays, Zap } from "lucide-react";
import { useState } from "react";
import { ja } from "react-day-picker/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { deliveryTimeSlots, type DeliveryTimeSlot } from "@/config/shipping";
import { fromYmd } from "@/lib/dates";
import { formatDate, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CheckoutQuote } from "@/server/actions/checkout";
import { FarmShipmentCard } from "./farm-shipment-card";
import { localDateToYmd, ymdToLocalDate } from "./local-date";

const slotKeys = Object.keys(deliveryTimeSlots) as DeliveryTimeSlot[];

export function DeliveryStep({
  quote, loading, desiredDate, onDesiredDate, timeSlot, onTimeSlot, error,
}: {
  quote: CheckoutQuote | null;
  loading: boolean;
  desiredDate: string | null;
  onDesiredDate: (v: string | null) => void;
  timeSlot: DeliveryTimeSlot;
  onTimeSlot: (v: DeliveryTimeSlot) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!quote) {
    return loading ? (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-36 w-full rounded-xl" />
      </div>
    ) : (
      <p className="text-muted-foreground bg-muted/40 rounded-xl p-4 text-sm">お届け先の都道府県を選ぶと、お届け可能日と送料が表示されます。</p>
    );
  }
  const earliest = quote.earliestDeliveryDate;
  const latest = quote.latestSelectableDate;
  return (
    <div className={cn("space-y-6 transition-opacity", loading && "opacity-60")}>
      <div className="grid gap-5 md:grid-cols-2">
        <Field data-invalid={!!error}>
          <FieldLabel>お届け希望日</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={desiredDate ? "outline" : "default"}
              className="h-auto flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-left"
              onClick={() => onDesiredDate(null)}
              aria-pressed={!desiredDate}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium"><Zap className="size-3.5" />最短でお届け</span>
              <span className="text-xs font-normal opacity-80">{formatShortDate(fromYmd(earliest))}ごろ</span>
            </Button>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant={desiredDate ? "default" : "outline"}
                  className="h-auto flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-left"
                  aria-pressed={!!desiredDate}
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium"><CalendarDays className="size-3.5" />日付を指定</span>
                  <span className="text-xs font-normal opacity-80">{desiredDate ? formatShortDate(fromYmd(desiredDate)) : "カレンダーから選ぶ"}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  locale={ja}
                  selected={desiredDate ? ymdToLocalDate(desiredDate) : undefined}
                  defaultMonth={ymdToLocalDate(desiredDate ?? earliest)}
                  startMonth={ymdToLocalDate(earliest)}
                  endMonth={ymdToLocalDate(latest)}
                  disabled={[{ before: ymdToLocalDate(earliest) }, { after: ymdToLocalDate(latest) }]}
                  onSelect={(d) => {
                    onDesiredDate(d ? localDateToYmd(d) : null);
                    setOpen(false);
                  }}
                />
                <p className="text-muted-foreground border-t px-3 py-2 text-xs">
                  {formatDate(fromYmd(earliest))}〜{formatDate(fromYmd(latest))}の間で指定できます
                </p>
              </PopoverContent>
            </Popover>
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
        </Field>
        <Field>
          <FieldLabel>時間帯</FieldLabel>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={2}
            value={timeSlot}
            onValueChange={(v) => v && onTimeSlot(v as DeliveryTimeSlot)}
            className="grid w-full grid-cols-3"
            aria-label="配達時間帯"
          >
            {slotKeys.map((k) => (
              <ToggleGroupItem key={k} value={k} className="data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary h-10 text-xs">
                {deliveryTimeSlots[k].label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">
          生産者ごとの発送（{quote.farms.length}便）
          <span className="text-muted-foreground ml-2 text-xs font-normal">農家さんごとに箱詰めして直接お送りします</span>
        </p>
        {quote.farms.map((f) => (
          <FarmShipmentCard key={f.farmId} farm={f} />
        ))}
      </div>
    </div>
  );
}
