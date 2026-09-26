"use client";
import { Download, FileCheck2, FileUp, Gift, PackageCheck, PackageOpen, Printer, Send, Truck, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge, ToneBadge } from "@/components/common/status-badge";
import { orderCancelCopy } from "@/config/order-cancel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { routes } from "@/config/nav";
import { carriers, deliveryTimeSlots, type DeliveryTimeSlot } from "@/config/shipping";
import type { Carrier } from "@/db/schema/marketplace";
import type { YMD } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { shipOrdersBulk, startPreparing, type BulkResult } from "@/server/actions/farmer-orders";
import type { ShippingQueueRow } from "@/server/queries/farmer";
import { LazyTrackingImportDialog } from "../lazy";
import { itemsSummaryText } from "../orders/items-summary";
import { ShipByBadge, shipUrgency, shipUrgencyMeta, type ShipUrgency } from "../ship-by";
import { StepGuide } from "./step-guide";

const LABELS_ENDPOINT = "/api/farmer/labels";
const groupOrder: ShipUrgency[] = ["overdue", "today", "tomorrow", "later"];
type Encoding = "sjis" | "utf8";

function reportBulk(res: BulkResult, verb: string) {
  if (res.failed.length) toast.warning(`${res.done}件を${verb}。${res.failed.length}件は処理できませんでした`, { description: res.failed[0].error });
  else toast.success(`${res.done}件を${verb}`);
}

export function ShippingCenter({ rows, today, defaultCarrier }: { rows: ShippingQueueRow[]; today: YMD; defaultCarrier: Carrier }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [carrier, setCarrier] = useState<Carrier>(defaultCarrier);
  const [encoding, setEncoding] = useState<Encoding>("sjis");
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [importOpen, setImportOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // drop selections of rows that disappeared after refresh
  const ids = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
  const sel = useMemo(() => new Set([...selected].filter((id) => ids.has(id))), [selected, ids]);
  const selectedRows = rows.filter((r) => sel.has(r.id));
  const groups = useMemo(() => {
    const g = new Map<ShipUrgency, ShippingQueueRow[]>(groupOrder.map((k) => [k, []]));
    for (const r of rows) g.get(shipUrgency(r.shipByDate, today))!.push(r);
    return g;
  }, [rows, today]);
  const counts = {
    toPrepare: rows.filter((r) => r.status === "paid").length,
    toLabel: rows.filter((r) => !r.labelPrintedAt).length,
    toTrack: rows.filter((r) => r.labelPrintedAt).length,
  };
  const filled = rows.filter((r) => (tracking[r.id] ?? "").trim().length >= 8);

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const toggleMany = (list: ShippingQueueRow[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of list) {
        if (on) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });

  const prepare = (list: string[]) =>
    start(async () => {
      const res = await startPreparing(list);
      if (res.ok) reportBulk(res.data, "出荷準備中にしました");
      else toast.error(res.error);
    });

  const ship = (list: { id: string; trackingNumber: string }[]) =>
    start(async () => {
      const res = await shipOrdersBulk({ rows: list.map((r) => ({ ...r, carrier })) });
      if (res.ok) {
        reportBulk(res.data, "発送済みにしました");
        setTracking((prev) => {
          const next = { ...prev };
          for (const r of list) delete next[r.id];
          return next;
        });
      } else toast.error(res.error);
    });

  async function downloadLabels() {
    if (!selectedRows.length) return;
    setDownloading(true);
    try {
      const qs = new URLSearchParams({ ids: selectedRows.map((r) => r.id).join(","), carrier, encoding });
      const res = await fetch(`${LABELS_ENDPOINT}?${qs}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "送り状CSVを作成できませんでした");
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `${carrier}-labels.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`${carriers[carrier].csvLabel}をダウンロードしました`, { description: "配送ソフトに取り込んで送り状を印刷してください" });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ダウンロードに失敗しました");
    } finally {
      setDownloading(false);
    }
  }

  function printSlips() {
    if (!selectedRows.length) return;
    const [first, ...rest] = selectedRows.map((r) => r.id);
    const qs = new URLSearchParams({ print: "1" });
    if (rest.length) qs.set("ids", rest.join(","));
    window.open(`${routes.farmer.slip(first)}?${qs}`, "_blank", "noopener");
  }

  if (!rows.length) {
    return (
      <div className="space-y-6">
        <StepGuide counts={counts} />
        <EmptyState icon={PackageCheck} title="出荷待ちの注文はありません" description="すべて発送済みです。おつかれさまでした。新しい注文が入るとメールと通知でお知らせします。">
          <Button asChild variant="outline">
            <Link href={`${routes.farmer.orders}?tab=shipped`}>発送済みの注文を見る</Link>
          </Button>
        </EmptyState>
      </div>
    );
  }

  const paidSelected = selectedRows.filter((r) => r.status === "paid").map((r) => r.id);

  return (
    <div className="space-y-6">
      <StepGuide counts={counts} />

      {/* settings row */}
      <div className="bg-card flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="sc-carrier" className="text-xs">今回使う配送業者</Label>
            <Select value={carrier} onValueChange={(v) => setCarrier(v as Carrier)}>
              <SelectTrigger id="sc-carrier" className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(carriers) as Carrier[]).map((c) => (
                  <SelectItem key={c} value={c}>{carriers[c].label}（{carriers[c].service}）</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-medium">CSVの文字コード</span>
            <ToggleGroup type="single" variant="outline" spacing={0} size="sm" value={encoding} onValueChange={(v) => v && setEncoding(v as Encoding)}>
              <ToggleGroupItem value="sjis" className="px-3 text-xs">Shift_JIS</ToggleGroupItem>
              <ToggleGroupItem value="utf8" className="px-3 text-xs">UTF-8</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <FileUp />追跡番号を一括登録
        </Button>
      </div>

      {groupOrder.map((key) => {
        const list = groups.get(key)!;
        if (!list.length) return null;
        const allOn = list.every((r) => sel.has(r.id));
        const someOn = list.some((r) => sel.has(r.id));
        const meta = shipUrgencyMeta[key];
        return (
          <section key={key} aria-labelledby={`g-${key}`} className="space-y-2">
            <div className="flex items-center gap-3 px-1">
              <Checkbox
                checked={allOn ? true : someOn ? "indeterminate" : false}
                onCheckedChange={(v) => toggleMany(list, v === true)}
                aria-label={`${meta.label}をすべて選択`}
              />
              <h2 id={`g-${key}`} className="flex items-center gap-2 text-sm font-semibold">
                <ToneBadge tone={meta.tone}>{meta.label}</ToneBadge>
                <span className="num">{list.length}件</span>
              </h2>
              <p className="text-muted-foreground hidden text-xs sm:block">{meta.description}</p>
            </div>
            <ul className="space-y-2">
              {list.map((r) => {
                const on = sel.has(r.id);
                const t = tracking[r.id] ?? "";
                const slot = r.deliveryTimeSlot ? deliveryTimeSlots[r.deliveryTimeSlot as DeliveryTimeSlot]?.label : null;
                return (
                  <li
                    key={r.id}
                    className={cn(
                      "bg-card grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3 rounded-xl border p-3 transition-colors sm:p-4 lg:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center",
                      on && "border-primary/50 bg-primary/5",
                      key === "overdue" && !on && "border-destructive/30",
                    )}
                  >
                    <Checkbox checked={on} onCheckedChange={(v) => toggle(r.id, v === true)} aria-label={`${r.code}を選択`} className="mt-1 lg:mt-0" />
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Link href={routes.farmer.order(r.id)} className="font-medium hover:underline">{r.recipientName} 様</Link>
                        <span className="text-muted-foreground text-xs">{r.prefecture}{r.city}</span>
                        {r.gift && (r.gift.wrapping || r.gift.noshi || r.gift.message) && <Gift className="text-onion-red size-3.5" aria-label="ギフト" />}
                      </div>
                      <p className="line-clamp-1 text-xs">{itemsSummaryText(r.items)}</p>
                      <p className="text-muted-foreground font-mono text-[11px]">{r.code}</p>
                    </div>
                    <div className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs lg:col-start-auto lg:flex-col lg:items-start">
                      <ShipByBadge shipByDate={r.shipByDate} today={today} />
                      <span className="text-muted-foreground">{r.boxSize}サイズ×{r.boxCount}{slot && `・${slot}`}</span>
                      <span className="flex items-center gap-1.5">
                        <StatusBadge kind="farmOrder" status={r.status} className="text-[10px]" />
                        {r.cancelRequested && <ToneBadge tone="danger" className="text-[10px]">{orderCancelCopy.farmer.listBadge}</ToneBadge>}
                        {r.labelPrintedAt && (
                          <span className="text-leaf inline-flex items-center gap-0.5 text-[10px] font-medium"><FileCheck2 className="size-3" />送り状済</span>
                        )}
                      </span>
                    </div>
                    <form
                      className="col-span-2 flex gap-2 lg:col-span-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (t.trim()) ship([{ id: r.id, trackingNumber: t }]);
                      }}
                    >
                      {r.status === "paid" && !t && (
                        <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={pending} onClick={() => prepare([r.id])}>
                          <PackageOpen />準備
                        </Button>
                      )}
                      <Input
                        value={t}
                        onChange={(e) => setTracking((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        placeholder="追跡番号"
                        inputMode="numeric"
                        autoComplete="off"
                        aria-label={`${r.code}の追跡番号`}
                        className="h-9 min-w-0 flex-1 font-mono"
                      />
                      <Button type="submit" size="sm" className="h-9 shrink-0" disabled={pending || t.trim().length < 8}>
                        <Truck />発送
                      </Button>
                    </form>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {/* sticky bulk bar */}
      {(sel.size > 0 || filled.length > 0) && (
        <div className="sticky bottom-0 z-30 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="bg-background/95 flex flex-wrap items-center gap-2 rounded-2xl border p-2.5 shadow-lg backdrop-blur-md">
            {sel.size > 0 && (
              <>
                <span className="flex items-center gap-1 pl-1 text-sm font-medium">
                  <span className="num">{sel.size}</span>件を選択中
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => setSelected(new Set())} aria-label="選択を解除"><X /></Button>
                </span>
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={pending || !paidSelected.length} onClick={() => prepare(paidSelected)}>
                    <PackageOpen />出荷準備中にする{paidSelected.length > 0 && `（${paidSelected.length}）`}
                  </Button>
                  <Button size="sm" variant="outline" disabled={downloading} onClick={downloadLabels}>
                    {downloading ? <Spinner /> : <Download />}送り状CSV
                  </Button>
                  <Button size="sm" variant="outline" onClick={printSlips}>
                    <Printer />納品書を印刷
                  </Button>
                </div>
              </>
            )}
            {filled.length > 0 && (
              <Button size="sm" className={cn("rounded-full", sel.size === 0 && "ml-auto")} disabled={pending} onClick={() => ship(filled.map((r) => ({ id: r.id, trackingNumber: tracking[r.id] })))}>
                {pending ? <Spinner /> : <Send />}入力済み{filled.length}件を発送済みにする
              </Button>
            )}
          </div>
        </div>
      )}

      {importOpen && (
        <LazyTrackingImportDialog open={importOpen} onOpenChange={setImportOpen} defaultCarrier={carrier} />
      )}
    </div>
  );
}
