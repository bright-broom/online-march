"use client";
import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { SubmitButton } from "@/components/common/submit-button";
import { ToneBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/dashboard/data-table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { fromYmd } from "@/lib/dates";
import { formatDate, formatNumber, formatYen } from "@/lib/format";
import { deleteCoupon, saveCoupon } from "@/server/actions/admin-content";
import { ConfirmAction } from "../confirm-action";
import { DatePickerField } from "../date-picker-field";
import { couponPhaseMeta, couponTypeMeta, type CouponPhase } from "../labels";
import { CouponActiveSwitch } from "../toggles";
import { fieldErrors, useFormAction } from "../use-admin-action";

export type CouponRow = {
  id: string;
  code: string;
  description: string;
  type: "percent" | "fixed";
  value: number;
  minSubtotal: number;
  maxUses: number | null;
  usedCount: number;
  startsYmd: string | null;
  endsYmd: string | null;
  isActive: boolean;
  phase: CouponPhase;
};

const discountLabel = (c: Pick<CouponRow, "type" | "value">) => (c.type === "percent" ? `${c.value}%OFF` : `${formatYen(c.value)}引き`);

export function CouponsManager({ rows }: { rows: CouponRow[] }) {
  const [editing, setEditing] = useState<CouponRow | "new" | null>(null);
  const columns: ColumnDef<CouponRow>[] = [
    {
      accessorKey: "code",
      header: "コード",
      cell: ({ row: { original: c } }) => (
        <div className="min-w-36">
          <code className="bg-muted rounded px-1.5 py-0.5 text-xs font-semibold tracking-wider">{c.code}</code>
          {c.description && <p className="text-muted-foreground mt-1 max-w-56 truncate text-xs">{c.description}</p>}
        </div>
      ),
    },
    {
      id: "discount",
      accessorFn: (c) => c.value,
      header: "割引",
      cell: ({ row: { original: c } }) => (
        <div className="whitespace-nowrap">
          <p className="num font-semibold">{discountLabel(c)}</p>
          <p className="text-muted-foreground text-[11px]">{c.minSubtotal > 0 ? `${formatYen(c.minSubtotal)}以上` : "条件なし"}</p>
        </div>
      ),
    },
    {
      id: "usage",
      accessorFn: (c) => c.usedCount,
      header: "利用状況",
      cell: ({ row: { original: c } }) => (
        <div className="w-36 space-y-1.5">
          <p className="num text-xs">
            {formatNumber(c.usedCount)}
            <span className="text-muted-foreground"> / {c.maxUses == null ? "無制限" : formatNumber(c.maxUses)}</span>
          </p>
          <Progress value={c.maxUses ? Math.min(100, (c.usedCount / c.maxUses) * 100) : c.usedCount > 0 ? 100 : 0} className={c.maxUses == null ? "opacity-40" : undefined} />
        </div>
      ),
    },
    {
      id: "period",
      accessorFn: (c) => c.startsYmd ?? "",
      header: "期間",
      cell: ({ row: { original: c } }) => (
        <span className="text-xs whitespace-nowrap">
          {c.startsYmd ? formatDate(fromYmd(c.startsYmd)) : "—"} 〜 {c.endsYmd ? formatDate(fromYmd(c.endsYmd)) : "—"}
        </span>
      ),
    },
    {
      accessorKey: "phase",
      header: "状態",
      cell: ({ row: { original: c } }) => <ToneBadge tone={couponPhaseMeta[c.phase].tone}>{couponPhaseMeta[c.phase].label}</ToneBadge>,
    },
    { id: "active", header: "有効", enableSorting: false, cell: ({ row: { original: c } }) => <CouponActiveSwitch id={c.id} active={c.isActive} /> },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row: { original: c } }) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" aria-label={`${c.code} を編集`} onClick={() => setEditing(c)}><Pencil /></Button>
          <ConfirmAction
            trigger={<Button variant="ghost" size="icon" aria-label={`${c.code} を削除`}><Trash2 /></Button>}
            title={`クーポン ${c.code} を削除しますか？`}
            description={c.usedCount > 0 ? `すでに${c.usedCount}回利用されています。履歴を残す場合は削除せず「有効」をオフにしてください。` : "この操作は取り消せません。"}
            confirmLabel="削除する"
            destructive
            action={() => deleteCoupon({ id: c.id })}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        searchPlaceholder="コード・説明で検索"
        emptyText="クーポンはまだありません"
        toolbar={<Button size="sm" onClick={() => setEditing("new")}><Plus />新規クーポン</Button>}
      />
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          {editing !== null && (
            <CouponForm key={editing === "new" ? "new" : editing.id} coupon={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CouponForm({ coupon, onDone }: { coupon: CouponRow | null; onDone: () => void }) {
  const [state, onSubmit, pending] = useFormAction(saveCoupon, { onSuccess: onDone });
  const [type, setType] = useState<"percent" | "fixed">(coupon?.type ?? "percent");
  const [code, setCode] = useState(coupon?.code ?? "");
  const err = (n: string) => fieldErrors(state, n);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{coupon ? "クーポンを編集" : "新規クーポン"}</DialogTitle>
        <DialogDescription>割引はプラットフォーム負担です（生産者の精算額は減りません）。</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="space-y-4">
        <input type="hidden" name="id" value={coupon?.id ?? ""} />
        <input type="hidden" name="type" value={type} />
        <FieldGroup className="gap-4">
          <Field data-invalid={Boolean(err("code"))}>
            <FieldLabel htmlFor="coupon-code">コード</FieldLabel>
            <Input id="coupon-code" name="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SPRING2026" autoComplete="off" required className="font-mono tracking-wider uppercase" />
            <FieldError errors={err("code")} />
          </Field>
          <Field data-invalid={Boolean(err("description"))}>
            <FieldLabel htmlFor="coupon-desc">説明</FieldLabel>
            <Input id="coupon-desc" name="description" defaultValue={coupon?.description} placeholder="新玉ねぎシーズン記念" maxLength={120} />
            <FieldError errors={err("description")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>割引の種類</FieldLabel>
              <Select value={type} onValueChange={(v) => setType(v as "percent" | "fixed")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(couponTypeMeta) as ("percent" | "fixed")[]).map((t) => (
                    <SelectItem key={t} value={t}>{couponTypeMeta[t].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field data-invalid={Boolean(err("value"))}>
              <FieldLabel htmlFor="coupon-value">割引</FieldLabel>
              <InputGroup>
                <InputGroupInput id="coupon-value" name="value" type="number" min={1} max={type === "percent" ? 100 : undefined} defaultValue={coupon?.value ?? ""} required />
                <InputGroupAddon align="inline-end"><InputGroupText>{couponTypeMeta[type].unit}</InputGroupText></InputGroupAddon>
              </InputGroup>
              <FieldError errors={err("value")} />
            </Field>
            <Field data-invalid={Boolean(err("minSubtotal"))}>
              <FieldLabel htmlFor="coupon-min">最低購入金額</FieldLabel>
              <InputGroup>
                <InputGroupInput id="coupon-min" name="minSubtotal" type="number" min={0} step={100} defaultValue={coupon?.minSubtotal ?? 0} />
                <InputGroupAddon align="inline-end"><InputGroupText>円</InputGroupText></InputGroupAddon>
              </InputGroup>
              <FieldError errors={err("minSubtotal")} />
            </Field>
            <Field data-invalid={Boolean(err("maxUses"))}>
              <FieldLabel htmlFor="coupon-max">利用上限</FieldLabel>
              <InputGroup>
                <InputGroupInput id="coupon-max" name="maxUses" type="number" min={1} defaultValue={coupon?.maxUses ?? ""} placeholder="無制限" />
                <InputGroupAddon align="inline-end"><InputGroupText>回</InputGroupText></InputGroupAddon>
              </InputGroup>
              <FieldError errors={err("maxUses")} />
            </Field>
            <DatePickerField name="startsAt" label="開始日" defaultValue={coupon?.startsYmd} placeholder="すぐに開始" errors={err("startsAt")} />
            <DatePickerField name="endsAt" label="終了日（当日23:59まで）" defaultValue={coupon?.endsYmd} placeholder="期限なし" errors={err("endsAt")} />
          </div>
          <Field orientation="horizontal" className="bg-muted/40 items-center justify-between rounded-xl p-3">
            <div>
              <FieldLabel htmlFor="coupon-active">有効にする</FieldLabel>
              <FieldDescription className="text-xs">オフの間はチェックアウトで使えません。</FieldDescription>
            </div>
            <Switch id="coupon-active" name="isActive" defaultChecked={coupon?.isActive ?? true} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <SubmitButton pending={pending}>{coupon ? "保存する" : "作成する"}</SubmitButton>
        </DialogFooter>
      </form>
    </>
  );
}
