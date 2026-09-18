import { ExternalLink, Truck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { routes } from "@/config/nav";
import { carriers } from "@/config/shipping";
import { fromYmd } from "@/lib/dates";
import { formatShortDate } from "@/lib/format";
import type { ActiveShipment } from "@/server/queries/account";
import { FulfillmentTracker } from "./fulfillment-tracker";

export function ActiveShipmentCard({ shipment }: { shipment: ActiveShipment }) {
  const carrier = carriers[shipment.carrier];
  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex -space-x-2">
            {shipment.items.slice(0, 3).map((i, idx) => (
              <div key={idx} className="bg-muted ring-card relative size-10 overflow-hidden rounded-lg ring-2">
                {i.imageUrl && <Image src={i.imageUrl} alt={i.name} fill sizes="40px" className="object-cover" />}
              </div>
            ))}
          </div>
          <div className="min-w-0">
            <Link href={routes.mypage.order(shipment.orderId)} className="block truncate text-sm font-medium hover:underline">
              {shipment.farmName}
            </Link>
            <p className="text-muted-foreground num text-xs">{shipment.code}</p>
          </div>
        </div>
        <div className="text-right text-xs">
          <p className="text-muted-foreground">お届け予定</p>
          <p className="text-sm font-semibold">
            {shipment.estimatedDeliveryDate ? formatShortDate(fromYmd(shipment.estimatedDeliveryDate)) : "—"}
          </p>
        </div>
      </div>
      <FulfillmentTracker status={shipment.status} compact />
      {shipment.trackingNumber && (
        <a
          href={carrier.trackingUrl(shipment.trackingNumber)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
        >
          <Truck className="size-3.5" />
          {carrier.label} {shipment.trackingNumber} で荷物を追跡
          <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}
