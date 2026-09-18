"use client";
import { Ban, PackageOpen, Send, Truck } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { carriers } from "@/config/shipping";
import { farmOrderStatusMeta, farmOrderTransitions } from "@/config/status";
import type { Carrier, FarmOrderStatus } from "@/db/schema/marketplace";
import { cancelOrder, shipOrder, startPreparing } from "@/server/actions/farmer-orders";

/** Next-step actions for a farm order, driven by config `farmOrderTransitions`. */
export function OrderActionPanel({
  id, status, carrier: initialCarrier, trackingNumber,
}: { id: string; status: FarmOrderStatus; carrier: Carrier; trackingNumber: string | null }) {
  const next = farmOrderTransitions[status];
  const [pending, start] = useTransition();
  const [carrier, setCarrier] = useState<Carrier>(initialCarrier);
  const [tracking, setTracking] = useState(trackingNumber ?? "");
  const [trackingError, setTrackingError] = useState<string>();
  const [reason, setReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);

  const canPrepare = next.includes("preparing");
  const canShip = next.includes("shipped");
  const canCancel = next.includes("cancelled");

  if (!canPrepare && !canShip && !canCancel) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>対応状況</CardTitle>
          <CardDescription>{farmOrderStatusMeta[status].description ?? `この注文は「${farmOrderStatusMeta[status].label}」です。`}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle>次にやること</CardTitle>
        <CardDescription>
          {status === "paid" ? "内容を確認して、出荷準備を始めましょう。" : "箱詰めができたら、追跡番号を入れて発送済みにします。"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {canPrepare && (
          <Button
            className="w-full"
            size="lg"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await startPreparing([id]);
                if (res.ok) toast.success("出荷準備中にしました", { description: "お客さまの注文画面にも反映されます" });
                else toast.error(res.error);
              })
            }
          >
            {pending ? <Spinner /> : <PackageOpen />}
            出荷準備を開始
          </Button>
        )}

        {canShip && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setTrackingError(undefined);
              start(async () => {
                const res = await shipOrder({ id, carrier, trackingNumber: tracking });
                if (res.ok) toast.success(res.message);
                else {
                  setTrackingError(res.fieldErrors?.trackingNumber?.[0]);
                  toast.error(res.error);
                }
              });
            }}
          >
            <FieldGroup className="gap-3">
              <Field>
                <FieldLabel htmlFor="carrier">配送業者</FieldLabel>
                <Select value={carrier} onValueChange={(v) => setCarrier(v as Carrier)}>
                  <SelectTrigger id="carrier" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(carriers) as Carrier[]).map((c) => (
                      <SelectItem key={c} value={c}>{carriers[c].label}（{carriers[c].service}）</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field data-invalid={!!trackingError || undefined}>
                <FieldLabel htmlFor="tracking">追跡番号（伝票番号）</FieldLabel>
                <Input
                  id="tracking"
                  inputMode="numeric"
                  autoComplete="off"
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  placeholder="例：1234-5678-9012"
                  aria-invalid={!!trackingError || undefined}
                />
                <FieldDescription>発送済みにすると、追跡リンク付きの発送メールが自動でお客さまに届きます。</FieldDescription>
                <FieldError>{trackingError}</FieldError>
              </Field>
            </FieldGroup>
            <Button type="submit" className="w-full" size="lg" variant={canPrepare ? "outline" : "default"} disabled={pending || !tracking.trim()}>
              {pending ? <Spinner /> : <Truck />}
              発送済みにする
            </Button>
          </form>
        )}

        {canCancel && (
          <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive w-full">
                <Ban />この注文をキャンセル
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>注文をキャンセルしますか？</AlertDialogTitle>
                <AlertDialogDescription>
                  在庫は自動で戻り、お客さまにキャンセルのお知らせが届きます。返金は運営が行います。この操作は取り消せません。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Field>
                <FieldLabel htmlFor="cancel-reason">キャンセル理由（お客さまにも表示されます）</FieldLabel>
                <Textarea id="cancel-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例：天候不良による不作のため、ご用意できなくなりました" maxLength={300} />
              </Field>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>やめる</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={pending || reason.trim().length < 2}
                  onClick={(e) => {
                    e.preventDefault();
                    start(async () => {
                      const res = await cancelOrder({ id, reason });
                      if (res.ok) {
                        toast.success(res.message);
                        setCancelOpen(false);
                      } else toast.error(res.error);
                    });
                  }}
                >
                  {pending ? <Spinner /> : <Send />}
                  キャンセルする
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardContent>
    </Card>
  );
}
