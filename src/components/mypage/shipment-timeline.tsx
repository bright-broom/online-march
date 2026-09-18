import { Icon } from "@/components/common/icon";
import { shipmentEventMeta } from "@/config/status";
import type { ShipmentEvent } from "@/db/schema";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Event = Pick<ShipmentEvent, "id" | "type" | "message" | "location" | "occurredAt">;

/** Vertical tracking timeline (newest first). Icons come from config/status#shipmentEventMeta. */
export function ShipmentTimeline({ events }: { events: Event[] }) {
  if (!events.length) return <p className="text-muted-foreground text-xs">まだ配送の記録はありません。</p>;
  return (
    <ol className="relative space-y-4">
      {events.map((e, i) => {
        const meta = shipmentEventMeta[e.type];
        const latest = i === 0;
        return (
          <li key={e.id} className="relative flex gap-3">
            {i < events.length - 1 && <span aria-hidden className="bg-border absolute top-7 bottom-[-1rem] left-3.5 w-px" />}
            <span
              className={cn(
                "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border",
                latest ? "border-primary bg-primary/10 text-primary" : "bg-background text-muted-foreground",
                e.type === "exception" && "border-destructive/40 bg-destructive/10 text-destructive",
              )}
            >
              <Icon name={meta.icon} className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className={cn("text-sm", latest && "font-medium")}>
                {meta.label}
                {e.location && <span className="text-muted-foreground ml-2 text-xs">{e.location}</span>}
              </p>
              {e.message && e.message !== meta.label && <p className="text-muted-foreground text-xs">{e.message}</p>}
              <p className="text-muted-foreground num text-[11px]">{formatDateTime(e.occurredAt)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
