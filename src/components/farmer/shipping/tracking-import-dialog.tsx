"use client";
import { CheckCircle2, ClipboardPaste, FileUp, Send, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { carriers } from "@/config/shipping";
import type { Carrier } from "@/db/schema/marketplace";
import { cn } from "@/lib/utils";
import { previewTrackingImport, shipOrdersBulk, type TrackingPreviewRow } from "@/server/actions/farmer-orders";

/** Carrier software exports are often Shift_JIS. Codes/numbers are ASCII, but decode properly for the preview. */
async function readCsvFile(file: File) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("shift_jis").decode(buf);
  }
}

/** 追跡番号を一括登録: paste / upload CSV → preview matches → confirm → shipped (発送メール自動). */
export default function TrackingImportDialog({
  open, onOpenChange, defaultCarrier,
}: { open: boolean; onOpenChange: (v: boolean) => void; defaultCarrier: Carrier }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<TrackingPreviewRow[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [carrier, setCarrier] = useState<Carrier>(defaultCarrier);
  const [pending, start] = useTransition();

  const analyze = (input: string) =>
    start(async () => {
      const res = await previewTrackingImport({ text: input });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPreview(res.data);
      setChecked(new Set(res.data.filter((r) => r.ok && r.id).map((r) => r.id!)));
    });

  const confirm = () => {
    const rows = (preview ?? []).filter((r) => r.ok && r.id && checked.has(r.id)).map((r) => ({ id: r.id!, trackingNumber: r.trackingNumber, carrier }));
    if (!rows.length) return;
    start(async () => {
      const res = await shipOrdersBulk({ rows });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { done, failed } = res.data;
      if (failed.length) toast.warning(`${done}件を発送済みにしました。${failed.length}件は登録できませんでした`, { description: failed[0].error });
      else toast.success(`${done}件を発送済みにしました`, { description: "お客さまへ追跡リンク付きの発送メールを送りました" });
      onOpenChange(false);
    });
  };

  const okRows = preview?.filter((r) => r.ok) ?? [];
  const ngRows = preview?.filter((r) => !r.ok) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>追跡番号を一括登録</DialogTitle>
          <DialogDescription>
            配送ソフトから出力した「発行済みデータ」のCSVを読み込むと、注文番号（AM-…）と追跡番号を自動で照合します。
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          <Tabs defaultValue="file" className="gap-4">
            <TabsList className="w-full">
              <TabsTrigger value="file"><FileUp />ファイルを選ぶ</TabsTrigger>
              <TabsTrigger value="paste"><ClipboardPaste />貼り付け</TabsTrigger>
            </TabsList>
            <TabsContent value="file">
              <label className="border-muted-foreground/30 hover:border-primary hover:text-primary text-muted-foreground flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors">
                <FileUp className="size-7" />
                <span className="text-sm font-medium">{fileName ?? "CSVファイルを選択"}</span>
                <span className="text-xs">Shift_JIS / UTF-8 どちらでも読み込めます</span>
                <input
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  className="sr-only"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    if (f.size > 2_000_000) {
                      toast.error("ファイルが大きすぎます（2MBまで）");
                      return;
                    }
                    setFileName(f.name);
                    const content = await readCsvFile(f);
                    setText(content);
                    analyze(content);
                  }}
                />
              </label>
            </TabsContent>
            <TabsContent value="paste" className="space-y-3">
              <Textarea
                rows={8}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="font-mono text-xs"
                placeholder={"例）\nAM-260918-7F3K-1,123456789012\nAM-260918-9QX2-1,234567890123"}
              />
              <Button onClick={() => analyze(text)} disabled={pending || !text.trim()} className="w-full">
                {pending && <Spinner />}照合する
              </Button>
            </TabsContent>
            {pending && <p className="text-muted-foreground flex items-center justify-center gap-2 text-sm"><Spinner />照合しています…</p>}
          </Tabs>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                <span className="text-leaf font-semibold"><span className="num">{okRows.length}</span>件</span>が登録できます
                {ngRows.length > 0 && <span className="text-muted-foreground">（{ngRows.length}件は対象外）</span>}
              </p>
              <div className="flex items-center gap-2">
                <Label htmlFor="imp-carrier" className="text-xs">配送業者</Label>
                <Select value={carrier} onValueChange={(v) => setCarrier(v as Carrier)}>
                  <SelectTrigger id="imp-carrier" size="sm" className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(carriers) as Carrier[]).map((c) => <SelectItem key={c} value={c}>{carriers[c].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <ScrollArea className="h-72 rounded-xl border">
              <ul className="divide-y">
                {preview.map((r) => (
                  <li key={`${r.code}-${r.trackingNumber}`} className={cn("flex items-center gap-3 px-3 py-2.5 text-sm", !r.ok && "opacity-60")}>
                    {r.ok && r.id ? (
                      <Checkbox
                        checked={checked.has(r.id)}
                        onCheckedChange={(v) =>
                          setChecked((prev) => {
                            const next = new Set(prev);
                            if (v === true) next.add(r.id!);
                            else next.delete(r.id!);
                            return next;
                          })
                        }
                        aria-label={`${r.code}を登録する`}
                      />
                    ) : (
                      <TriangleAlert className="text-destructive size-4 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs">{r.code}</p>
                      <p className="text-muted-foreground truncate text-xs">{r.ok ? `${r.recipientName ?? ""} 様` : r.reason}</p>
                    </div>
                    <span className="font-mono text-xs tabular-nums">{r.trackingNumber}</span>
                    {r.ok && <CheckCircle2 className="text-leaf size-4 shrink-0" />}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          {preview ? (
            <>
              <Button variant="ghost" onClick={() => setPreview(null)} disabled={pending}>読み込み直す</Button>
              <Button onClick={confirm} disabled={pending || checked.size === 0}>
                {pending ? <Spinner /> : <Send />}
                {checked.size}件を発送済みにする
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>閉じる</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
