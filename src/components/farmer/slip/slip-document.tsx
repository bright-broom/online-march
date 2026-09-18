import { LogoMark } from "@/components/common/logo";
import { siteConfig } from "@/config/site";
import { deliveryTimeSlots, type DeliveryTimeSlot } from "@/config/shipping";
import type { Farm } from "@/db/schema";
import { fromYmd } from "@/lib/dates";
import { formatDate, formatNumber, formatPostalCode } from "@/lib/format";
import type { SlipOrder } from "@/server/queries/farmer";

/** Print CSS: hide dashboard chrome, A4, one slip per page. */
export const slipPrintCss = `
@media print {
  @page { size: A4; margin: 12mm; }
  [data-slot=sidebar], [data-slot=sidebar-gap], [data-slot=sidebar-container], [data-slot=sidebar-inset] > header { display: none !important; }
  [data-slot=sidebar-wrapper], [data-slot=sidebar-inset] { display: block !important; margin: 0 !important; box-shadow: none !important; border: 0 !important; background: white !important; min-height: 0 !important; }
  [data-slot=sidebar-inset] > div { padding: 0 !important; }
  .slip-page { break-after: page; box-shadow: none !important; border: 0 !important; margin: 0 !important; padding: 0 !important; }
  .slip-page:last-child { break-after: auto; }
}`;

type SlipFarm = Pick<Farm, "name" | "representative" | "postalCode" | "prefecture" | "city" | "addressLine" | "phone">;

/** 納品書 for one farm order. Gift orders hide prices (贈答用). */
export function SlipDocument({ fo, farm, issuedAt }: { fo: SlipOrder; farm: SlipFarm; issuedAt: Date }) {
  const a = fo.order.shippingAddress;
  const gift = fo.order.gift;
  const isGift = Boolean(gift && (gift.wrapping || gift.noshi || gift.message));
  const slot = fo.order.deliveryTimeSlot ? deliveryTimeSlots[fo.order.deliveryTimeSlot as DeliveryTimeSlot]?.label : null;
  const total = fo.subtotal + fo.shippingFee - fo.discount;

  return (
    <article className="slip-page bg-card mx-auto mb-8 max-w-[210mm] rounded-xl border p-8 text-[13px] leading-relaxed shadow-sm sm:p-12">
      <header className="flex items-start justify-between gap-6 border-b-2 border-current pb-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-[0.3em]">納品書</h1>
          <p className="mt-1 text-xs">{isGift ? "お届け明細（ご贈答用）" : "お届け明細"}</p>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-3 text-right text-xs">
          <dt>注文番号</dt><dd className="font-mono">{fo.code}</dd>
          <dt>ご注文日</dt><dd>{formatDate(fo.order.createdAt)}</dd>
          <dt>発行日</dt><dd>{formatDate(issuedAt)}</dd>
        </dl>
      </header>

      <section className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-xs">お届け先</p>
          <p className="mt-1 text-lg font-semibold">{a.recipientName} 様</p>
          <p>〒{formatPostalCode(a.postalCode)}</p>
          <p>{a.prefecture}{a.city}{a.line1}</p>
          {a.line2 && <p>{a.line2}</p>}
          {(fo.order.desiredDeliveryDate || slot) && (
            <p className="mt-2 text-xs">
              お届け希望：{fo.order.desiredDeliveryDate ? formatDate(fromYmd(fo.order.desiredDeliveryDate)) : "日付指定なし"}
              {slot && ` ${slot}`}
            </p>
          )}
        </div>
        <div className="sm:text-right">
          <p className="text-xs">発送元</p>
          <p className="mt-1 text-base font-semibold">{farm.name}</p>
          <p>{farm.representative}</p>
          {farm.postalCode && <p>〒{formatPostalCode(farm.postalCode)}</p>}
          <p>{farm.prefecture}{farm.city}{farm.addressLine}</p>
          {farm.phone && <p>TEL {farm.phone}</p>}
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs sm:justify-end">
            <LogoMark className="size-4" />{siteConfig.name}
          </p>
        </div>
      </section>

      <table className="mt-8 w-full border-collapse text-left">
        <thead>
          <tr className="border-y border-current text-xs">
            <th className="py-2 font-medium">品名</th>
            <th className="py-2 font-medium">規格</th>
            <th className="py-2 text-right font-medium">数量</th>
            {!isGift && <th className="py-2 text-right font-medium">単価</th>}
            {!isGift && <th className="py-2 text-right font-medium">金額</th>}
          </tr>
        </thead>
        <tbody>
          {fo.items.map((it) => (
            <tr key={it.id} className="border-b border-current/20">
              <td className="py-2 pr-2">{it.productName}</td>
              <td className="py-2 pr-2">{it.variantLabel}</td>
              <td className="py-2 text-right tabular-nums">{it.quantity}</td>
              {!isGift && <td className="py-2 text-right tabular-nums">{formatNumber(it.unitPrice)}円</td>}
              {!isGift && <td className="py-2 text-right tabular-nums">{formatNumber(it.lineTotal)}円</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {isGift ? (
        <p className="mt-3 text-right text-xs">ご贈答品のため、金額の記載を省略しております。</p>
      ) : (
        <dl className="mt-4 ml-auto grid max-w-64 grid-cols-2 gap-y-1 text-right tabular-nums">
          <dt className="text-left">商品小計</dt><dd>{formatNumber(fo.subtotal)}円</dd>
          <dt className="text-left">送料</dt><dd>{formatNumber(fo.shippingFee)}円</dd>
          {fo.discount > 0 && (<><dt className="text-left">クーポン割引</dt><dd>−{formatNumber(fo.discount)}円</dd></>)}
          <dt className="border-t border-current pt-1 text-left font-semibold">合計（税込）</dt>
          <dd className="border-t border-current pt-1 font-semibold">{formatNumber(total)}円</dd>
        </dl>
      )}

      {gift?.message && (
        <section className="mt-8 rounded-lg border border-current/40 p-4">
          <p className="text-xs">メッセージ</p>
          <p className="mt-1 font-serif text-base whitespace-pre-wrap">{gift.message}</p>
          {gift.noshi && <p className="mt-2 text-xs">のし：{gift.noshi}</p>}
        </section>
      )}

      <footer className="mt-10 border-t border-current/30 pt-4 text-xs leading-relaxed">
        <p className="font-serif text-sm">このたびは{farm.name}の玉ねぎをお選びいただき、ありがとうございます。</p>
        <p>
          南あわじの畑で育てた玉ねぎを、収穫したてのまま箱に詰めてお届けしました。届いたら箱から出して、風通しのよい日陰で保存してください。
          お気づきの点がございましたら、{siteConfig.name}のマイページ「メッセージ」からお気軽にご連絡ください。
        </p>
      </footer>
    </article>
  );
}
