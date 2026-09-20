"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { BadgeCheck, CircleDashed, FileText, Landmark } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Price } from "@/components/common/price";
import { StatusBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/dashboard/data-table";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { bpsToPercent } from "@/config/fees";
import { routes } from "@/config/nav";
import { formatDate, formatDateTime, formatYen } from "@/lib/format";
import { markPayoutPaid } from "@/server/actions/admin-ops";
import type { AdminPayoutRow } from "@/server/queries/admin";
import { ConfirmAction } from "../confirm-action";

export function PayoutsTable({ rows }: { rows: AdminPayoutRow[] }) {
  const [detail, setDetail] = useState<AdminPayoutRow | null>(null);
  const columns: ColumnDef<AdminPayoutRow>[] = [
    {
      accessorKey: "farmName",
      header: "生産者",
      cell: ({ row: { original: p } }) => (
        <div className="min-w-36">
          <Link href={routes.admin.farm(p.farmId)} className="font-medium hover:underline">{p.farmName}</Link>
          <p className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
            {p.stripeOnboarded ? <><BadgeCheck className="text-leaf size-3" />Stripe 登録済み</> : <><CircleDashed className="size-3" />手動振込</>}
          </p>
        </div>
      ),
    },
    {
      id: "period",
      accessorFn: (p) => p.periodEnd,
      header: "対象期間",
      cell: ({ row: { original: p } }) => <span className="text-xs whitespace-nowrap">{formatDate(p.periodStart)}〜{formatDate(p.periodEnd)}</span>,
    },
    { accessorKey: "orderCount", header: "件数", cell: ({ getValue }) => <span className="num">{Number(getValue())}</span> },
    { accessorKey: "grossSales", header: "商品代金", cell: ({ getValue }) => <span className="num text-xs">{formatYen(Number(getValue()))}</span> },
    { accessorKey: "shippingFees", header: "送料", cell: ({ getValue }) => <span className="num text-xs">{formatYen(Number(getValue()))}</span> },
    { accessorKey: "commission", header: "手数料", cell: ({ getValue }) => <span className="num text-primary text-xs">−{formatYen(Number(getValue()))}</span> },
    { accessorKey: "refundAdjustment", header: "返金調整", cell: ({ getValue }) => (Number(getValue()) ? <span className="num text-destructive text-xs">−{formatYen(Number(getValue()))}</span> : <span className="text-muted-foreground text-xs">—</span>) },
    { accessorKey: "amount", header: "振込額", cell: ({ getValue }) => <Price amount={Number(getValue())} size="sm" showTax={false} /> },
    {
      id: "scheduledFor",
      accessorFn: (p) => p.scheduledFor ?? "",
      header: "振込予定日",
      cell: ({ row: { original: p } }) => (
        <div className="text-xs whitespace-nowrap">
          <p>{formatDate(p.scheduledFor)}</p>
          {p.paidAt && <p className="text-muted-foreground">振込 {formatDate(p.paidAt)}</p>}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "状態",
      cell: ({ row: { original: p } }) => (
        <div className="space-y-1">
          <StatusBadge kind="payout" status={p.status} />
          {p.status !== "paid" && p.transferError && <p className="text-destructive max-w-56 text-[11px] leading-tight">送金できませんでした：{p.transferError}</p>}
        </div>
      ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row: { original: p } }) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setDetail(p)}><FileText />詳細</Button>
          {p.status !== "paid" && (
            <ConfirmAction
              trigger={<Button variant="outline" size="sm"><Landmark />振込済みにする</Button>}
              title="振込済みにしますか？"
              description={`${p.farmName} へ ${formatYen(p.amount)} を銀行振込したことを記録します。生産者に通知されます。`}
              confirmLabel="振込済みにする"
              action={() => markPayoutPaid({ payoutId: p.id })}
            />
          )}
        </div>
      ),
    },
  ];
  return (
    <>
      <DataTable columns={columns} data={rows} getRowId={(r) => r.id} pageSize={25} searchPlaceholder="生産者名で検索" emptyText="精算はまだありません" />
      <PayoutSheet payout={detail} onOpenChange={(o) => !o && setDetail(null)} />
    </>
  );
}

function PayoutSheet({ payout: p, onOpenChange }: { payout: AdminPayoutRow | null; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet open={p !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {p && (
          <>
            <SheetHeader>
              <SheetTitle>{p.farmName} の精算明細</SheetTitle>
              <SheetDescription>{formatDate(p.periodStart)}〜{formatDate(p.periodEnd)}・{p.orderCount}件</SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-6">
              <div className="bg-muted/50 grid grid-cols-2 gap-3 rounded-xl p-4 text-sm">
                <Stat label="商品代金" value={formatYen(p.grossSales)} />
                <Stat label="送料" value={formatYen(p.shippingFees)} />
                <Stat label="販売手数料" value={`−${formatYen(p.commission)}`} />
                {p.refundAdjustment > 0 && <Stat label="返金調整" value={`−${formatYen(p.refundAdjustment)}`} />}
                <Stat label="振込額" value={formatYen(p.amount)} strong />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <StatusBadge kind="payout" status={p.status} />
                <span className="text-muted-foreground">振込予定 {formatDate(p.scheduledFor)}</span>
                {p.paidAt && <span className="text-muted-foreground">振込日時 {formatDateTime(p.paidAt)}</span>}
                {p.stripeTransferId && <code className="bg-muted rounded px-1.5 py-0.5 text-[11px]">{p.stripeTransferId}</code>}
              </div>
              {p.status !== "paid" && p.transferError && (
                <p className="text-destructive text-xs leading-relaxed">
                  送金できませんでした：{p.transferError}
                  {p.transferAttemptedAt && <span className="text-muted-foreground">（{formatDateTime(p.transferAttemptedAt)}）</span>}
                </p>
              )}
              <Separator />
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs">受注番号</TableHead>
                    <TableHead className="text-xs">配達完了</TableHead>
                    <TableHead className="text-right text-xs">代金+送料</TableHead>
                    <TableHead className="text-right text-xs">手数料</TableHead>
                    <TableHead className="text-right text-xs">精算額</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {p.items.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-muted-foreground h-16 text-center text-xs">明細がありません</TableCell></TableRow>
                  )}
                  {p.items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell><Link href={routes.admin.order(it.orderId)} className="num text-xs hover:underline">{it.code}</Link></TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{formatDate(it.deliveredAt)}</TableCell>
                      <TableCell className="num text-right text-xs">{formatYen(it.subtotal + it.shippingFee)}</TableCell>
                      <TableCell className="num text-right text-xs">
                        −{formatYen(it.commissionAmount)}
                        <span className="text-muted-foreground ml-1">({bpsToPercent(it.commissionRateBps)}%)</span>
                      </TableCell>
                      <TableCell className="num text-right text-xs font-medium">{formatYen(it.payoutAmount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={strong ? "num text-lg font-semibold" : "num"}>{value}</p>
    </div>
  );
}
