"use client";
import { useState } from "react";
import { SubmitButton } from "@/components/common/submit-button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { bpsToPercent, calcCommission } from "@/config/fees";
import { formatYen } from "@/lib/format";
import { setFarmCommission, setFarmStatus } from "@/server/actions/admin-farms";
import { fieldErrors, useFormAction, useRunAction } from "../use-admin-action";

export type FarmStatusIntent = "approve" | "reject" | "suspend" | "resume";

const intentCopy: Record<FarmStatusIntent, { title: string; description: string; confirm: string; destructive: boolean; reason: boolean }> = {
  approve: {
    title: "出店申請を承認しますか？",
    description: "ショップが公開され、申請者のロールが「生産者」に変わります。承認メールとアプリ通知が送信されます。",
    confirm: "承認する",
    destructive: false,
    reason: false,
  },
  reject: {
    title: "出店申請を見送りますか？",
    description: "ショップは「停止中」になり、申請者に通知されます。あとから再開することもできます。",
    confirm: "見送る",
    destructive: true,
    reason: true,
  },
  suspend: {
    title: "ショップを停止しますか？",
    description: "停止中の生産者の商品はストアから自動的に非表示になります。進行中の注文の出荷は継続でき、その売上は通常どおり精算・振込されます。",
    confirm: "停止する",
    destructive: true,
    reason: true,
  },
  resume: {
    title: "ショップを再開しますか？",
    description: "ショップと販売中の商品がストアに再び表示されます。",
    confirm: "再開する",
    destructive: false,
    reason: false,
  },
};

/** Controlled confirm for farm status changes (承認/却下/停止/再開). */
export function FarmStatusDialog({
  farm,
  intent,
  onOpenChange,
}: {
  farm: { id: string; name: string };
  intent: FarmStatusIntent | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, run] = useRunAction();
  const copy = intent ? intentCopy[intent] : null;
  const submit = () => {
    if (!intent) return;
    const status = intent === "approve" || intent === "resume" ? "active" : "suspended";
    run(() => setFarmStatus({ farmId: farm.id, status, reason: reason || undefined }), {
      onSuccess: () => {
        setReason("");
        onOpenChange(false);
      },
    });
  };
  return (
    <AlertDialog open={intent !== null} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <AlertDialogContent>
        {copy && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{copy.title}</AlertDialogTitle>
              <AlertDialogDescription>
                <span className="text-foreground font-medium">{farm.name}</span>
                <br />
                {copy.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {copy.reason && (
              <Field>
                <FieldLabel htmlFor="farm-status-reason">生産者へのメッセージ（任意）</FieldLabel>
                <Textarea id="farm-status-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} placeholder="理由や今後の手続きなど" />
              </Field>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>キャンセル</AlertDialogCancel>
              <Button variant={copy.destructive ? "destructive" : "default"} disabled={pending} onClick={submit}>
                {pending && <Spinner />}
                {copy.confirm}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Per-farm commission override (entered as %, stored as bps; empty = platform default). */
export function CommissionDialog({
  farm,
  platformBps,
  open,
  onOpenChange,
}: {
  farm: { id: string; name: string; commissionRateBps: number | null };
  platformBps: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [value, setValue] = useState(farm.commissionRateBps == null ? "" : String(bpsToPercent(farm.commissionRateBps)));
  const [state, onSubmit, pending] = useFormAction(setFarmCommission, { onSuccess: () => onOpenChange(false) });
  const pct = value === "" ? bpsToPercent(platformBps) : Number(value);
  const bps = Number.isFinite(pct) ? Math.round(pct * 100) : platformBps;
  const sample = 10_000;
  const fee = calcCommission(sample, bps);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>販売手数料率</DialogTitle>
          <DialogDescription>{farm.name} に個別の手数料率を設定します。空欄にすると標準（{bpsToPercent(platformBps)}%）が適用されます。</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <input type="hidden" name="farmId" value={farm.id} />
          <Field data-invalid={Boolean(fieldErrors(state, "ratePercent"))}>
            <FieldLabel htmlFor="ratePercent">手数料率</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id="ratePercent"
                name="ratePercent"
                inputMode="decimal"
                type="number"
                step="0.1"
                min={0}
                max={50}
                value={value}
                placeholder={String(bpsToPercent(platformBps))}
                onChange={(e) => setValue(e.target.value)}
              />
              <InputGroupAddon align="inline-end"><InputGroupText>%</InputGroupText></InputGroupAddon>
            </InputGroup>
            <FieldDescription>
              保存値 <span className="num">{bps}</span> bps。変更は今後の注文にのみ適用され、過去の注文は注文時の率のままです。
            </FieldDescription>
            <FieldError errors={fieldErrors(state, "ratePercent")} />
          </Field>
          <div className="bg-muted/50 grid grid-cols-3 gap-2 rounded-xl p-3 text-center text-xs">
            <div>
              <p className="text-muted-foreground">商品代金</p>
              <p className="num mt-1 text-sm font-semibold">{formatYen(sample)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">手数料</p>
              <p className="num text-primary mt-1 text-sm font-semibold">{formatYen(fee)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">生産者の受取</p>
              <p className="num mt-1 text-sm font-semibold">{formatYen(sample - fee)}</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setValue("")}>標準に戻す</Button>
            <SubmitButton pending={pending}>保存する</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
