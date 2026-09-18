"use client";
import { Printer } from "lucide-react";
import { useState } from "react";
import { LogoMark } from "@/components/common/logo";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { siteConfig } from "@/config/site";
import { formatDate, formatNumber, formatPostalCode } from "@/lib/format";

/**
 * Print isolation without touching the dashboard shell: when printing, hide everything
 * except `.receipt-print` (visibility trick keeps layout of the receipt itself intact).
 */
const printCss = `
@media print {
  @page { size: A4; margin: 16mm; }
  body * { visibility: hidden !important; }
  .receipt-print, .receipt-print * { visibility: visible !important; }
  .receipt-print { position: absolute; inset: 0 auto auto 0; width: 100%; border: 0 !important; box-shadow: none !important; }
}`;

export type ReceiptData = {
  code: string;
  issuedAt: Date | string;
  total: number;
  subtotal: number;
  shippingTotal: number;
  discountTotal: number;
  paymentLabel: string;
  defaultName: string;
};

export function ReceiptView({ data }: { data: ReceiptData }) {
  const [name, setName] = useState(data.defaultName);
  const [purpose, setPurpose] = useState("玉ねぎ代として");
  const c = siteConfig.company;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <style>{printCss}</style>
      <div className="no-print bg-card grid gap-4 rounded-xl border p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field>
          <FieldLabel htmlFor="receipt-name">宛名</FieldLabel>
          <Input id="receipt-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </Field>
        <Field>
          <FieldLabel htmlFor="receipt-purpose">但し書き</FieldLabel>
          <Input id="receipt-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={40} />
        </Field>
        <Button onClick={() => window.print()} className="rounded-full">
          <Printer />印刷・PDF保存
        </Button>
        <FieldDescription className="sm:col-span-3">
          印刷画面で「PDFに保存」を選ぶとPDFとして保存できます。宛名・但し書きは印刷前に変更できます（保存はされません）。
        </FieldDescription>
      </div>

      <article className="receipt-print bg-background text-foreground rounded-xl border p-8 sm:p-12">
        <header className="flex items-start justify-between gap-6">
          <h1 className="heading-display text-3xl tracking-[0.5em]">領収書</h1>
          <dl className="text-right text-xs leading-relaxed">
            <div><dt className="inline text-muted-foreground">No. </dt><dd className="num inline">{data.code}</dd></div>
            <div><dt className="inline text-muted-foreground">発行日 </dt><dd className="inline">{formatDate(data.issuedAt)}</dd></div>
          </dl>
        </header>

        <p className="mt-10 border-b pb-2 text-xl">
          <span className="font-serif">{name || "　　　　　　"}</span>
          <span className="ml-3 text-base">様</span>
        </p>

        <div className="bg-muted/40 mt-8 flex items-baseline justify-center gap-3 rounded-lg border px-6 py-5">
          <span className="text-sm">金額</span>
          <span className="num text-4xl font-semibold tracking-tight">¥{formatNumber(data.total)}-</span>
          <span className="text-muted-foreground text-xs">（税込）</span>
        </div>

        <p className="mt-6 text-sm">但し　{purpose}</p>
        <p className="mt-1 text-sm">上記正に領収いたしました。</p>

        <div className="mt-8 grid gap-8 sm:grid-cols-2">
          <table className="w-full text-sm">
            <caption className="text-muted-foreground mb-2 text-left text-xs">内訳</caption>
            <tbody className="[&_td]:py-1">
              <tr><td className="text-muted-foreground">商品代金</td><td className="num text-right">¥{formatNumber(data.subtotal)}</td></tr>
              <tr><td className="text-muted-foreground">送料</td><td className="num text-right">¥{formatNumber(data.shippingTotal)}</td></tr>
              {data.discountTotal > 0 && (
                <tr><td className="text-muted-foreground">割引</td><td className="num text-right">−¥{formatNumber(data.discountTotal)}</td></tr>
              )}
              <tr className="border-t font-medium"><td className="pt-2">合計</td><td className="num pt-2 text-right">¥{formatNumber(data.total)}</td></tr>
              <tr><td className="text-muted-foreground text-xs" colSpan={2}>お支払い方法：{data.paymentLabel}</td></tr>
            </tbody>
          </table>
          <div className="space-y-2 text-sm sm:text-right">
            <p className="flex items-center gap-2 font-serif font-semibold sm:justify-end">
              <LogoMark className="size-7" />
              {siteConfig.name}
            </p>
            <p className="font-medium">{c.operator}</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              〒{formatPostalCode(c.postalCode.replace("-", ""))} {c.address}
              <br />
              TEL {siteConfig.contact.phone}　{siteConfig.contact.email}
            </p>
          </div>
        </div>
      </article>
    </div>
  );
}
