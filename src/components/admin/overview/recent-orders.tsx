import Link from "next/link";
import { paymentProviderMeta } from "@/components/admin/labels";
import { PanelCard } from "@/components/admin/primitives";
import { Price } from "@/components/common/price";
import { StatusBadge, ToneBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { routes } from "@/config/nav";
import { formatDateTime } from "@/lib/format";
import type { AdminOrderRow } from "@/server/queries/admin";

export function RecentOrders({ rows }: { rows: AdminOrderRow[] }) {
  return (
    <PanelCard
      title="最近の注文"
      action={
        <Button asChild variant="ghost" size="sm">
          <Link href={routes.admin.orders}>すべての注文</Link>
        </Button>
      }
      contentClassName="px-0"
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4 text-xs">注文番号</TableHead>
            <TableHead className="text-xs">日時</TableHead>
            <TableHead className="text-xs">お客さま</TableHead>
            <TableHead className="text-xs">生産者数</TableHead>
            <TableHead className="text-xs">決済</TableHead>
            <TableHead className="text-right text-xs">合計</TableHead>
            <TableHead className="pr-4 text-xs">状態</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-muted-foreground h-24 text-center">注文はまだありません</TableCell>
            </TableRow>
          )}
          {rows.map((o) => {
            const provider = paymentProviderMeta[o.paymentProvider] ?? { label: o.paymentProvider, tone: "neutral" as const };
            return (
              <TableRow key={o.id}>
                <TableCell className="pl-4">
                  <Link href={routes.admin.order(o.id)} className="num font-medium hover:underline">{o.code}</Link>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{formatDateTime(o.createdAt)}</TableCell>
                <TableCell className="max-w-40 truncate">{o.customerName}</TableCell>
                <TableCell className="num">{o.farmCount}</TableCell>
                <TableCell><ToneBadge tone={provider.tone}>{provider.label}</ToneBadge></TableCell>
                <TableCell className="text-right"><Price amount={o.total} size="sm" showTax={false} /></TableCell>
                <TableCell className="pr-4"><StatusBadge kind="order" status={o.status} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </PanelCard>
  );
}
