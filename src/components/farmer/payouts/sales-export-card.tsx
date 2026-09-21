"use client";
import { Download, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

const ENDPOINT = "/api/farmer/sales";
type Encoding = "sjis" | "utf8";

/** 確定申告・記帳用の売上明細を CSV で書き出す。期間は「年」か「今年のここまで」を選ぶだけにする。 */
export function SalesExportCard({ thisYear }: { thisYear: number }) {
  const years = [thisYear, thisYear - 1, thisYear - 2];
  const [year, setYear] = useState(String(thisYear));
  const [encoding, setEncoding] = useState<Encoding>("sjis");
  const [downloading, setDownloading] = useState(false);

  async function download() {
    setDownloading(true);
    try {
      const qs = new URLSearchParams({ from: `${year}-01-01`, to: `${year}-12-31`, encoding });
      const res = await fetch(`${ENDPOINT}?${qs}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "売上明細を作成できませんでした");
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `sales-${year}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`${year}年の売上明細をダウンロードしました`, { description: "確定申告や記帳にそのままお使いいただけます" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ダウンロードに失敗しました");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="size-4" />売上明細の書き出し
        </CardTitle>
        <CardDescription>
          注文日・商品・商品代金・送料・販売手数料・受取額を1件ずつ並べた CSV です。確定申告や記帳にお使いください。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <Field className="w-32">
          <FieldLabel htmlFor="sales-year">対象期間</FieldLabel>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger id="sales-year"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}年</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field className="w-44">
          <FieldLabel htmlFor="sales-encoding">文字コード</FieldLabel>
          <Select value={encoding} onValueChange={(v) => setEncoding(v as Encoding)}>
            <SelectTrigger id="sales-encoding"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sjis">Shift_JIS（Excel）</SelectItem>
              <SelectItem value="utf8">UTF-8</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Button onClick={download} disabled={downloading} className="rounded-full">
          {downloading ? <Spinner /> : <Download />}ダウンロード
        </Button>
      </CardContent>
    </Card>
  );
}
