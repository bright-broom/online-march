"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronRight, FileText } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/dashboard/data-table";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/config/nav";
import { useIsMobile } from "@/hooks/use-mobile";
import { fromYmd } from "@/lib/dates";
import { formatDate, formatNumber, formatShortDate } from "@/lib/format";
import { fetchPayoutOrders } from "@/server/actions/farmer-orders";
import type { FarmPayoutRow, PayoutOrderRow } from "@/server/queries/farmer";

const yen = (n: number) => `${formatNumber(n)}円`;
const period = (p: FarmPayoutRow) => `${formatShortDate(fromYmd(p.periodStart))}〜${formatShortDate(fromYmd(p.periodEnd))}`;

export function PayoutsTable({ rows }: { rows: FarmPayoutRow[] }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState<FarmPayoutRow | null>(null);
  const [orders, setOrders] = useState<PayoutOrderRow[] | null>(null);
  const [pending, start] = useTransition();

  const show = (p: FarmPayoutRow) => {
    setOpen(p);
    setOrders(null);
    start(async () => {
      const res = await fetchPayoutOrders(p.id);
      if (res.ok) setOrders(res.data);
      else toast.error(res.error);
    });
  };

  const columns: ColumnDef<FarmPayoutRow, unknown>[] = [
    { id: "period", accessorFn: (r) => r.periodStart, header: "対象期間", cell: ({ row }) => <span className="text-xs whitespace-nowrap">{period(row.original)}</span> },
    { id: "orders", accessorFn: (r) => r.orderCount, header: "注文", cell: ({ row }) => <span className="num">{row.original.orderCount}件</span> },
    { id: "gross", accessorFn: (r) => r.grossSales, header: "商品売上", cell: ({ row }) => <span className="num whitespace-nowrap">{yen(row.original.grossSales)}</span> },
    { id: "shipping", accessorFn: (r) => r.shippingFees, header: "送料", cell: ({ row }) => <span className="num whitespace-nowrap">{yen(row.original.shippingFees)}</span> },
    { id: "commission", accessorFn: (r) => r.commission, header: "手数料", cell: ({ row }) => <span className="num text-muted-foreground whitespace-nowrap">−{yen(row.original.commission)}</span> },
    { id: "refundAdjustment", accessorFn: (r) => r.refundAdjustment, header: "返金調整", cell: ({ row }) => row.original.refundAdjustment ? <span className="num text-destructive whitespace-nowrap">−{yen(row.original.refundAdjustment)}</span> : <span className="text-muted-foreground">—</span> },
    { id: "amount", accessorFn: (r) => r.amount, header: "お振込額", cell: ({ row }) => <span className="num font-semibold whitespace-nowrap">{yen(row.original.amount)}</span> },
    { id: "status", accessorFn: (r) => r.status, header: "状態", cell: ({ row }) => <StatusBadge kind="payout" status={row.original.status} /> },
    {
      id: "date",
      accessorFn: (r) => r.scheduledFor ?? "",
      header: "振込日",
      cell: ({ row: { original: p } }) => (
        <span className="text-xs whitespace-nowrap">{p.paidAt ? `${formatDate(p.paidAt)}（済）` : p.scheduledFor ? `${formatDate(fromYmd(p.scheduledFor))} 予定` : "—"}</span>
      ),
    },
    {
      id: "detail",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" onClick={() => show(row.original)}>
          内訳<ChevronRight />
        </Button>
      ),
    },
  ];

  return (
    <>
      <DataTable columns={columns} data={rows} getRowId={(r) => r.id} searchPlaceholder={false} emptyText="まだ精算はありません。月末締め・翌月15日払いです。" pageSize={12} />
      <Drawer open={!!open} onOpenChange={(v) => !v && setOpen(null)} direction={isMobile ? "bottom" : "right"}>
        <DrawerContent className="data-[vaul-drawer-direction=right]:sm:max-w-md">
          {open && (
            <>
              <DrawerHeader>
                <DrawerTitle>精算の内訳</DrawerTitle>
                <DrawerDescription>{period(open)}・{open.orderCount}件</DrawerDescription>
              </DrawerHeader>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-6">
                <dl className="bg-muted/40 space-y-1.5 rounded-xl p-4 text-sm">
                  <div className="flex justify-between"><dt className="text-muted-foreground">商品売上</dt><dd className="num">{yen(open.grossSales)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">送料</dt><dd className="num">{yen(open.shippingFees)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">販売手数料</dt><dd className="num">−{yen(open.commission)}</dd></div>
                  {open.refundAdjustment > 0 && (
                    <div className="flex justify-between"><dt className="text-muted-foreground">返金調整（精算済み注文の返金）</dt><dd className="num text-destructive">−{yen(open.refundAdjustment)}</dd></div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-semibold"><dt>お振込額</dt><dd className="num">{yen(open.amount)}</dd></div>
                </dl>
                <Button asChild variant="outline" size="sm" className="w-full rounded-full">
                  <Link href={routes.farmer.payoutStatement(open.id)}><FileText />支払通知書を開く（印刷・PDF）</Link>
                </Button>
                {pending || !orders ? (
                  <div className="space-y-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
                ) : orders.length ? (
                  <ul className="divide-y rounded-xl border">
                    {orders.map((o) => (
                      <li key={o.id}>
                        <Link href={routes.farmer.order(o.id)} className="hover:bg-muted/50 flex items-center justify-between gap-3 px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="font-mono text-xs">{o.code}</p>
                            <p className="text-muted-foreground text-[11px]">
                              {formatDate(o.deliveredAt ?? o.createdAt)}・売上 {yen(o.subtotal)}＋送料 {yen(o.shippingFee)}−手数料 {yen(o.commissionAmount)}
                            </p>
                          </div>
                          <span className="num shrink-0 text-sm font-medium">{yen(o.payoutAmount)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-sm">対象の注文が見つかりません</p>
                )}
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}
