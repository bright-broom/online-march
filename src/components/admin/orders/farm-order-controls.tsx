"use client";
import { Ban, CheckCheck, PackageOpen, RotateCcw, Truck } from "lucide-react";
import { useState } from "react";
import { SubmitButton } from "@/components/common/submit-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { carriers } from "@/config/shipping";
import { farmOrderStatusMeta, farmOrderTransitions } from "@/config/status";
import type { Carrier, FarmOrderStatus } from "@/db/schema/marketplace";
import { formatYen } from "@/lib/format";
import { adminTransitionFarmOrder, refundOrder } from "@/server/actions/admin-orders";
import { ConfirmAction } from "../confirm-action";
import { useRunAction } from "../use-admin-action";

/** Statuses the admin may set by hand (paid = payment flow, refunded = refund flow). */
const MANUAL: FarmOrderStatus[] = ["preparing", "shipped", "delivered", "cancelled"];
const icons: Partial<Record<FarmOrderStatus, React.ComponentType>> = { preparing: PackageOpen, shipped: Truck, delivered: CheckCheck, cancelled: Ban };

export type FarmOrderControlTarget = {
  id: string;
  code: string;
  status: FarmOrderStatus;
  carrier: Carrier;
  trackingNumber: string | null;
  payoutId: string | null;
  refundAmount: number;
  refunded: boolean;
};

export function FarmOrderControls({ orderId, fo, canRefund }: { orderId: string; fo: FarmOrderControlTarget; canRefund: boolean }) {
  const [shipOpen, setShipOpen] = useState(false);
  const next = farmOrderTransitions[fo.status].filter((s) => MANUAL.includes(s));
  const refundable = canRefund && !fo.refunded && ["paid", "preparing", "delivered", "cancelled"].includes(fo.status);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {next.map((to) => {
        const I = icons[to] ?? PackageOpen;
        const label = `「${farmOrderStatusMeta[to].label}」にする`;
        if (to === "shipped") {
          return (
            <Button key={to} size="sm" variant="outline" onClick={() => setShipOpen(true)}>
              <I />
              {label}
            </Button>
          );
        }
        return (
          <ConfirmAction
            key={to}
            trigger={<Button size="sm" variant={to === "cancelled" ? "destructive" : "outline"}><I />{label}</Button>}
            title={`${fo.code} を${label}`}
            description={
              to === "cancelled"
                ? "在庫が戻り、お客さまと生産者に通知されます。返金は別途「返金」から行ってください。"
                : `ステータスを「${farmOrderStatusMeta[fo.status].label}」から「${farmOrderStatusMeta[to].label}」に変更します。お客さまの注文画面に反映されます。`
            }
            confirmLabel={to === "cancelled" ? "キャンセルする" : "変更する"}
            destructive={to === "cancelled"}
            action={() => adminTransitionFarmOrder({ farmOrderId: fo.id, to })}
          />
        );
      })}
      {refundable && (
        <ConfirmAction
          trigger={<Button size="sm" variant="ghost" className="text-destructive"><RotateCcw />返金</Button>}
          title={`${fo.code} を返金しますか？`}
          description={
            <>
              この出荷単位の支払額 <span className="num text-foreground font-semibold">{formatYen(fo.refundAmount)}</span> を返金します。
              {fo.status === "paid" || fo.status === "preparing" ? " 未発送のためキャンセル扱いになり在庫が戻ります。" : ""}
              {fo.payoutId ? " この売上はすでに精算に含まれています。生産者への精算額の調整を別途行ってください。" : ""}
            </>
          }
          confirmLabel="返金する"
          destructive
          action={() => refundOrder({ orderId, farmOrderId: fo.id })}
        />
      )}
      <ShipDialog fo={fo} open={shipOpen} onOpenChange={setShipOpen} />
    </div>
  );
}

function ShipDialog({ fo, open, onOpenChange }: { fo: FarmOrderControlTarget; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [carrier, setCarrier] = useState<Carrier>(fo.carrier);
  const [tracking, setTracking] = useState(fo.trackingNumber ?? "");
  const [pending, run] = useRunAction();
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>発送済みにする</DialogTitle>
          <DialogDescription>{fo.code} の追跡番号を登録し、お客さまへ発送メールを送信します。</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => adminTransitionFarmOrder({ farmOrderId: fo.id, to: "shipped", carrier, trackingNumber: tracking }), {
              onSuccess: () => onOpenChange(false),
            });
          }}
        >
          <Field>
            <FieldLabel>配送業者</FieldLabel>
            <Select value={carrier} onValueChange={(v) => setCarrier(v as Carrier)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(carriers) as Carrier[]).map((c) => (
                  <SelectItem key={c} value={c}>{carriers[c].label}（{carriers[c].service}）</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor={`tracking-${fo.id}`}>追跡番号</FieldLabel>
            <Input id={`tracking-${fo.id}`} value={tracking} onChange={(e) => setTracking(e.target.value)} inputMode="numeric" required minLength={6} maxLength={40} placeholder="例: 1234-5678-9012" />
            <FieldDescription>ハイフンは自動で整えられます。</FieldDescription>
          </Field>
          <DialogFooter>
            <SubmitButton pending={pending}>発送済みにする</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Whole-order refund (header button). */
export function OrderRefundButton({ orderId, code, amount, stripe, note }: { orderId: string; code: string; amount: number; stripe: boolean; note?: string }) {
  return (
    <ConfirmAction
      trigger={<Button variant="destructive" size="sm"><RotateCcw />注文全体を返金</Button>}
      title={`${code} を返金しますか？`}
      description={
        <>
          未返金の出荷単位すべて（最大 <span className="num text-foreground font-semibold">{formatYen(amount)}</span>）を返金します。
          {stripe ? " Stripe で残額を返金します。" : " デモ決済のため、状態のみ「返金済み」に更新します。"}
          {note ? ` ${note}` : ""}
        </>
      }
      confirmLabel="返金する"
      destructive
      action={() => refundOrder({ orderId })}
    />
  );
}
