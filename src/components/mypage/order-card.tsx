import { ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Price } from "@/components/common/price";
import { StatusBadge } from "@/components/common/status-badge";
import { routes } from "@/config/nav";
import { formatDate } from "@/lib/format";
import type { OrderListItem } from "@/server/queries/account";

/** Order row for the orders list / mypage home. */
export function OrderCard({ order }: { order: OrderListItem }) {
  const extra = order.itemCount - order.thumbnails.length;
  return (
    <Link
      href={routes.mypage.order(order.id)}
      className="group bg-card hover:border-primary/40 flex flex-col gap-4 rounded-xl border p-4 transition-colors sm:flex-row sm:items-center"
    >
      <div className="flex shrink-0 -space-x-3">
        {order.thumbnails.map((t) => (
          <div key={t.id} className="bg-muted ring-card relative size-14 overflow-hidden rounded-xl ring-2">
            {t.url && <Image src={t.url} alt={t.name} fill sizes="56px" className="object-cover" />}
          </div>
        ))}
        {extra > 0 && (
          <div className="bg-muted text-muted-foreground ring-card relative flex size-14 items-center justify-center rounded-xl text-xs ring-2">
            +{extra}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="num font-semibold tracking-wide">{order.code}</span>
          <span className="text-muted-foreground text-xs">{formatDate(order.createdAt)}</span>
          {order.status === "pending_payment" && <StatusBadge kind="order" status="pending_payment" />}
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
          {order.farmOrders.map((fo) => (
            <li key={fo.id} className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground max-w-[10rem] truncate">{fo.farm.name}</span>
              <StatusBadge kind="farmOrder" status={fo.status} />
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-end">
        <Price amount={order.total} size="md" showTax={false} />
        <span className="text-muted-foreground group-hover:text-primary inline-flex items-center text-xs transition-colors">
          詳細<ChevronRight className="size-3.5" />
        </span>
      </div>
    </Link>
  );
}
