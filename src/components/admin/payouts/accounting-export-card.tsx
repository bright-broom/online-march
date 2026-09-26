"use client";
import { Download, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { routes } from "@/config/nav";

type Encoding = "utf8" | "sjis";
const monthLabel = (m: string) => `${m.slice(0, 4)}年${Number(m.slice(5))}月`;

/** 運営向け会計CSV（#21）。月を選んで、明細と生産者別の集計をまとめて書き出す。 */
export function AccountingExportCard({ months }: { months: string[] }) {
  const [month, setMonth] = useState(months[0]);
  const [encoding, setEncoding] = useState<Encoding>("utf8");
  const [downloading, setDownloading] = useState(false);

  async function download() {
    setDownloading(true);
    try {
      const res = await fetch(`${routes.admin.accountingCsv}?${new URLSearchParams({ month, encoding })}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "会計CSVを作成できませんでした");
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `accounting-${month}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(`${monthLabel(month)}の会計CSVをダウンロードしました`);
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
          <FileSpreadsheet className="size-4" />会計CSVの書き出し
        </CardTitle>
        <CardDescription>
          注文日で選んだ月の出荷単位ごとの明細（商品代金・送料・クーポン割引・販売手数料・生産者受取額・返金）と、生産者別の集計です。勘定科目は付けていません。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <Field className="w-40">
          <FieldLabel htmlFor="accounting-month">対象月</FieldLabel>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger id="accounting-month"><SelectValue /></SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field className="w-44">
          <FieldLabel htmlFor="accounting-encoding">文字コード</FieldLabel>
          <Select value={encoding} onValueChange={(v) => setEncoding(v as Encoding)}>
            <SelectTrigger id="accounting-encoding"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="utf8">UTF-8（BOM付き）</SelectItem>
              <SelectItem value="sjis">Shift_JIS</SelectItem>
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
