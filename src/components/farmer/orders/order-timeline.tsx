import { Icon } from "@/components/common/icon";
import { shipmentEventMeta } from "@/config/status";
import type { ShipmentEvent } from "@/db/schema";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const sourceLabel: Record<string, string> = { farmer: "生産者", admin: "運営", customer: "お客さま", cron: "自動", system: "システム", carrier: "配送業者" };

/** Shipment / status history (newest first). */
export function OrderTimeline({
  events,
}: {
  events: (Pick<ShipmentEvent, "id" | "type" | "message" | "location" | "source" | "occurredAt"> & { actor?: { name: string } | null })[];
}) {
  if (!events.length) return <p className="text-muted-foreground text-sm">まだ履歴はありません</p>;
  return (
    <ol className="relative space-y-5 pl-8 before:absolute before:top-2 before:bottom-2 before:left-3 before:w-px before:bg-border">
      {events.map((e, i) => (
        <li key={e.id} className="relative">
          <span
            className={cn(
              "bg-background absolute top-0 -left-8 flex size-6 items-center justify-center rounded-full border",
              i === 0 && "border-primary bg-primary text-primary-foreground",
            )}
          >
            <Icon name={shipmentEventMeta[e.type].icon} className="size-3.5" />
          </span>
          <p className="text-sm font-medium">{shipmentEventMeta[e.type].label}</p>
          <p className="text-muted-foreground text-xs leading-relaxed">{e.message}</p>
          <p className="text-muted-foreground mt-0.5 text-[11px] tabular-nums">
            {formatDateTime(e.occurredAt)}
            {e.location && `・${e.location}`}
            {e.actor ? `・${e.actor.name}` : sourceLabel[e.source] && `・${sourceLabel[e.source]}`}
          </p>
        </li>
      ))}
    </ol>
  );
}
