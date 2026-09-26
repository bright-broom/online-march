import { LogoMark } from "@/components/common/logo";
import { siteConfig } from "@/config/site";
import { taxConfig } from "@/config/tax";
import type { Farm } from "@/db/schema";
import { fromYmd } from "@/lib/dates";
import { formatDate, formatNumber, formatPostalCode } from "@/lib/format";
import { taxIncluded } from "@/lib/tax";
import type { PayoutStatement } from "@/server/queries/farmer";

export const statementPrintCss = `
@media print {
  @page { size: A4; margin: 14mm; }
  [data-slot=sidebar], [data-slot=sidebar-gap], [data-slot=sidebar-container], [data-slot=sidebar-inset] > header { display: none !important; }
  [data-slot=sidebar-wrapper], [data-slot=sidebar-inset] { display: block !important; margin: 0 !important; box-shadow: none !important; border: 0 !important; background: white !important; min-height: 0 !important; }
  [data-slot=sidebar-inset] > div { padding: 0 !important; }
  .statement-page { box-shadow: none !important; border: 0 !important; margin: 0 !important; padding: 0 !important; }
}`;

const yen = (n: number) => `¥${formatNumber(n)}`;

/**
 * 支払通知書（#10）。精算1件ごと。運営の登録番号が設定されていれば、販売手数料の適格請求書を兼ねる
 * （発行者・登録番号・取引年月日＝対象期間・内容・10% 対象の額と消費税額・受領者）。
 * 販売手数料は税込み（商品代金の税込額に料率を掛けたもの）として扱い、消費税額は 10% 対象の合計から1回切り捨てで出す（config/tax.ts）。
 */
export function PayoutStatementDocument({ statement, farm, issuedAt }: { statement: PayoutStatement; farm: Pick<Farm, "name" | "representative" | "postalCode" | "prefecture" | "city" | "addressLine">; issuedAt: Date }) {
  const { payout: p, orders, clawbacks } = statement;
  const c = siteConfig.company;
  const regNo = c.invoiceRegistrationNumber;
  const commissionTax = taxIncluded(p.commission, taxConfig.commissionRate);
  const payDate = p.paidAt ? formatDate(p.paidAt) : p.scheduledFor ? `${formatDate(fromYmd(p.scheduledFor))}（予定）` : "—";
  return (
    <article className="statement-page bg-background text-foreground mx-auto max-w-[210mm] rounded-xl border p-8 text-sm sm:p-12">
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="heading-display text-2xl tracking-[0.3em]">支払通知書</h1>
          {regNo && <p className="text-muted-foreground mt-1 text-xs">兼 適格請求書（販売手数料）</p>}
        </div>
        <dl className="text-right text-xs leading-relaxed">
          <div><dt className="text-muted-foreground inline">発行日 </dt><dd className="inline">{formatDate(issuedAt)}</dd></div>
          <div><dt className="text-muted-foreground inline">対象期間 </dt><dd className="inline">{formatDate(fromYmd(p.periodStart))}〜{formatDate(fromYmd(p.periodEnd))}</dd></div>
          <div><dt className="text-muted-foreground inline">お振込日 </dt><dd className="inline">{payDate}</dd></div>
        </dl>
      </header>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="border-b pb-1 text-lg font-medium">{farm.name} 御中</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {farm.representative} 様<br />
            〒{formatPostalCode(farm.postalCode)} {farm.prefecture}{farm.city}{farm.addressLine}
          </p>
        </div>
        <div className="space-y-1 text-xs sm:text-right">
          <p className="flex items-center gap-2 font-serif text-sm font-semibold sm:justify-end"><LogoMark className="size-6" />{siteConfig.name}</p>
          <p className="font-medium">{c.operator}</p>
          {regNo && <p className="num">登録番号 {regNo}</p>}
          <p className="text-muted-foreground">〒{formatPostalCode(c.postalCode.replace("-", ""))} {c.address}</p>
        </div>
      </div>

      <table className="mt-8 w-full">
        <caption className="text-muted-foreground mb-2 text-left text-xs">精算の内訳</caption>
        <tbody className="[&_td]:py-1.5">
          <tr><td>商品売上（{p.orderCount}件）</td><td className="num text-right">{yen(p.grossSales)}</td></tr>
          <tr><td>送料</td><td className="num text-right">{yen(p.shippingFees)}</td></tr>
          <tr>
            <td>販売手数料（税込・{taxConfig.commissionRate}%対象）</td>
            <td className="num text-right">−{yen(p.commission)}</td>
          </tr>
          <tr className="text-muted-foreground text-xs"><td className="pl-4">うち消費税（{taxConfig.commissionRate}%）</td><td className="num text-right">{yen(commissionTax)}</td></tr>
          {p.refundAdjustment > 0 && (
            <tr><td>返金の相殺（精算済みの注文の返金）</td><td className="num text-right">−{yen(p.refundAdjustment)}</td></tr>
          )}
          <tr className="border-t text-base font-semibold"><td className="pt-2">お振込額</td><td className="num pt-2 text-right">{yen(p.amount)}</td></tr>
        </tbody>
      </table>

      <table className="mt-8 w-full text-xs">
        <caption className="text-muted-foreground mb-2 text-left">対象の注文</caption>
        <thead className="text-muted-foreground border-b text-left [&_th]:py-1 [&_th]:font-normal">
          <tr><th>出荷番号</th><th>配達日</th><th className="text-right">商品売上</th><th className="text-right">送料</th><th className="text-right">販売手数料</th><th className="text-right">受取額</th></tr>
        </thead>
        <tbody className="[&_td]:py-1">
          {orders.map((o) => (
            <tr key={o.id} className="border-b border-dashed">
              <td className="font-mono">{o.code}</td>
              <td>{o.deliveredAt ? formatDate(o.deliveredAt) : "—"}</td>
              <td className="num text-right">{yen(o.subtotal)}</td>
              <td className="num text-right">{yen(o.shippingFee)}</td>
              <td className="num text-right">−{yen(o.commissionAmount)}</td>
              <td className="num text-right">{yen(o.payoutAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {clawbacks.length > 0 && (
        <table className="mt-6 w-full text-xs">
          <caption className="text-muted-foreground mb-2 text-left">相殺した返金</caption>
          <tbody className="[&_td]:py-1">
            {clawbacks.map((r) => (
              <tr key={r.id} className="border-b border-dashed">
                <td className="font-mono">{r.code}</td>
                <td>{r.refundedAt ? formatDate(r.refundedAt) : "—"} 返金</td>
                <td className="num text-right">−{yen(r.refundAmount ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="text-muted-foreground mt-8 text-[11px] leading-relaxed">
        商品代金・送料は、お客さまからお預かりした代金（税込）をそのままお支払いするものです。販売手数料は税込みで、消費税額は{taxConfig.commissionRate}%対象の合計から1円未満を切り捨てて計算しています。
        {!regNo && " 運営の登録番号の記載は、登録の完了後に追加されます。"}
      </p>
    </article>
  );
}
