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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { bpsToPercent, calcCommission } from "@/config/fees";
import { formatYen } from "@/lib/format";
import { setMaintenanceMode, updatePlatformCommission } from "@/server/actions/admin-ops";
import { fieldErrors, useFormAction, useRunAction } from "../use-admin-action";

const SAMPLES = [3_000, 10_000, 30_000];

export function CommissionRateForm({ currentBps, defaultBps }: { currentBps: number; defaultBps: number }) {
  const [value, setValue] = useState(String(bpsToPercent(currentBps)));
  const [state, onSubmit, pending] = useFormAction(updatePlatformCommission);
  const pct = Number(value);
  const bps = Number.isFinite(pct) && value !== "" ? Math.round(pct * 100) : currentBps;
  const changed = bps !== currentBps;
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field data-invalid={Boolean(fieldErrors(state, "ratePercent"))}>
        <FieldLabel htmlFor="platform-rate">標準の販売手数料率</FieldLabel>
        <div className="flex flex-wrap items-center gap-3">
          <InputGroup className="w-40">
            <InputGroupInput id="platform-rate" name="ratePercent" type="number" inputMode="decimal" step="0.1" min={0} max={50} value={value} onChange={(e) => setValue(e.target.value)} required />
            <InputGroupAddon align="inline-end"><InputGroupText>%</InputGroupText></InputGroupAddon>
          </InputGroup>
          <span className="text-muted-foreground text-xs">
            = <span className="num text-foreground">{bps}</span> bps（初期値 {bpsToPercent(defaultBps)}%）
          </span>
        </div>
        <FieldDescription>
          商品代金にのみ課金し、送料には課金しません。変更は<strong>これからの注文</strong>に適用され、過去の注文は注文時点の率のまま変わりません。個別の手数料率が設定された生産者には適用されません。
        </FieldDescription>
        <FieldError errors={fieldErrors(state, "ratePercent")} />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        {SAMPLES.map((s) => (
          <div key={s} className="bg-muted/50 rounded-xl p-3 text-xs">
            <p className="text-muted-foreground">売上 {formatYen(s)}</p>
            <p className="num text-primary mt-1 text-sm font-semibold">手数料 {formatYen(calcCommission(s, bps))}</p>
            <p className="num text-muted-foreground">生産者 {formatYen(s - calcCommission(s, bps))}</p>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <SubmitButton pending={pending} disabled={!changed}>保存する</SubmitButton>
      </div>
    </form>
  );
}

export function MaintenanceToggle({ enabled }: { enabled: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, run] = useRunAction();
  const toggle = (next: boolean) => run(() => setMaintenanceMode({ enabled: next }), { onSuccess: () => setConfirming(false) });
  return (
    <>
      <Field orientation="horizontal" className="items-center justify-between gap-4">
        <div className="space-y-1">
          <FieldLabel htmlFor="maintenance">メンテナンスモード</FieldLabel>
          <FieldDescription className="text-xs">有効にすると、ストアにメンテナンス中の案内を表示し新規注文を受け付けません（運営画面は利用できます）。</FieldDescription>
        </div>
        <Switch id="maintenance" checked={enabled} disabled={pending} onCheckedChange={(v) => (v ? setConfirming(true) : toggle(false))} />
      </Field>
      <AlertDialog open={confirming} onOpenChange={(o) => !pending && setConfirming(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>メンテナンスモードを有効にしますか？</AlertDialogTitle>
            <AlertDialogDescription>お客さまは新しく注文できなくなります。作業が終わったら必ず解除してください。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>キャンセル</AlertDialogCancel>
            <Button variant="destructive" disabled={pending} onClick={() => toggle(true)}>
              {pending && <Spinner />}
              有効にする
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
