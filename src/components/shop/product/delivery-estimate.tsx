"use client";
import { CalendarCheck, PackageCheck, Truck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { carriers } from "@/config/shipping";
import type { Carrier } from "@/db/schema/marketplace";
import { useHydrated } from "@/hooks/use-hydrated";
import { fromYmd } from "@/lib/dates";
import { formatShortDate, formatYenJa } from "@/lib/format";
import { useShippingPrefs } from "@/stores/cart";
import { estimateShipment, useTodayYmd } from "../cart/estimate";
import { PrefectureSelect } from "../cart/prefecture-select";

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];

/** Shipping fee & earliest delivery for the current selection (client clock + remembered prefecture). */
export function DeliveryEstimate({
  subtotal,
  weightGrams,
  farm,
}: {
  subtotal: number;
  weightGrams: number;
  farm: { leadTimeDays: number; shipWeekdays: number[]; carrier: Carrier; freeShippingThreshold: number | null };
}) {
  const hydrated = useHydrated();
  const prefecture = useShippingPrefs((s) => s.prefecture);
  const today = useTodayYmd();
  const est = estimateShipment({ subtotal, weightGrams, prefecture, today, ...farm });
  const closedDays = weekdayLabels.filter((_, i) => !farm.shipWeekdays.includes(i));

  return (
    <div className="bg-paper space-y-4 rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">お届けの目安</p>
        <PrefectureSelect />
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-background rounded-xl p-3">
          <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <CalendarCheck className="size-3.5" />
            最短お届け日
          </dt>
          <dd className="mt-1 font-serif text-lg font-semibold">
            {hydrated && est.schedule ? formatShortDate(fromYmd(est.schedule.earliestDeliveryDate)) : <Skeleton className="mt-1 h-6 w-20" />}
          </dd>
        </div>
        <div className="bg-background rounded-xl p-3">
          <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Truck className="size-3.5" />
            送料（{est.quote.boxSize}サイズ）
          </dt>
          <dd className="num mt-1 text-lg font-semibold">
            {!hydrated ? <Skeleton className="mt-1 h-6 w-16" /> : est.quote.isFree ? <span className="text-leaf">無料</span> : formatYenJa(est.quote.fee)}
          </dd>
        </div>
      </dl>
      <ul className="text-muted-foreground space-y-1.5 text-xs leading-relaxed">
        <li className="flex gap-1.5">
          <PackageCheck className="mt-0.5 size-3.5 shrink-0" />
          <span>
            ご注文から{farm.leadTimeDays}日以内に{carriers[farm.carrier].label}「{carriers[farm.carrier].service}」で出荷
            {closedDays.length > 0 && `（${closedDays.join("・")}曜は出荷休み）`}
          </span>
        </li>
        {farm.freeShippingThreshold != null && (
          <li className="text-foreground/80 pl-5">
            この農家さんの商品を合計{formatYenJa(farm.freeShippingThreshold)}以上で送料無料
            {hydrated && est.remainingForFree > 0 && `（あと${formatYenJa(est.remainingForFree)}）`}
          </li>
        )}
        <li className="pl-5">お届け希望日・時間帯はご注文手続きで指定できます。</li>
      </ul>
    </div>
  );
}
