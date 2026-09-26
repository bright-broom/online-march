"use client";
import { Hourglass, MessageSquareWarning, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { orderCancelCopy, orderCancelPolicy } from "@/config/order-cancel";
import type { CustomerCancelMode } from "@/lib/order-cancel";
import { cancelFarmOrder, requestFarmOrderCancel } from "@/server/actions/account";

const copy = orderCancelCopy.customer;

/**
 * 生産者ごとのキャンセル（#18）。準備前は「この生産者の分をキャンセル」（複数の生産者の注文のときだけ。1軒なら注文全体のキャンセルを使う）、
 * 出荷準備中は「キャンセルを依頼」、依頼後は状態の表示。判定は lib/order-cancel.ts#customerCancelMode（サーバーでも同じ判定で断る）
 */
export function FarmOrderCancel({ farmOrderId, mode, multiFarm, reply }: { farmOrderId: string; mode: CustomerCancelMode; multiFarm: boolean; reply: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  if (mode === "pending") {
    return <p className="bg-muted/50 flex items-start gap-2 rounded-lg p-3 text-sm"><Hourglass className="text-muted-foreground mt-0.5 size-4 shrink-0" />{copy.pending}</p>;
  }
  if (mode === "declined") {
    return (
      <div className="bg-muted/50 space-y-1 rounded-lg p-3 text-sm">
        <p className="flex items-start gap-2"><MessageSquareWarning className="text-muted-foreground mt-0.5 size-4 shrink-0" />{copy.declined}</p>
        {reply && <p className="text-muted-foreground pl-6 whitespace-pre-wrap">{reply}</p>}
      </div>
    );
  }
  if (mode !== "request" && !(mode === "cancel" && multiFarm)) return null;

  const isRequest = mode === "request";
  const submit = () =>
    start(async () => {
      const res = isRequest ? await requestFarmOrderCancel({ farmOrderId, reason }) : await cancelFarmOrder(farmOrderId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      setOpen(false);
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {isRequest && <p className="text-muted-foreground text-xs">{copy.preparingNote}</p>}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive ml-auto">
            <XCircle />{isRequest ? copy.request : copy.cancelFarmOrder}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isRequest ? copy.requestTitle : copy.cancelFarmOrderTitle}</AlertDialogTitle>
            <AlertDialogDescription>{isRequest ? copy.requestBody : copy.cancelFarmOrderBody}</AlertDialogDescription>
          </AlertDialogHeader>
          {isRequest && (
            <Field>
              <FieldLabel htmlFor={`cancel-reason-${farmOrderId}`}>{copy.requestReasonLabel}</FieldLabel>
              <Textarea id={`cancel-reason-${farmOrderId}`} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={orderCancelPolicy.reasonMaxLength} />
            </Field>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>戻る</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending || (isRequest && reason.trim().length < 2)} onClick={(e) => { e.preventDefault(); submit(); }}>
              {pending && <Spinner />}{isRequest ? copy.request : "キャンセルする"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
