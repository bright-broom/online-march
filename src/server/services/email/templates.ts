import "server-only";
import { routes } from "@/config/nav";
import { carriers, deliveryTimeSlots, type DeliveryTimeSlot } from "@/config/shipping";
import type { Carrier } from "@/db/schema";
import { siteUrl } from "@/lib/env";
import { formatDate, formatYen } from "@/lib/format";
import type { EmailMessage } from ".";

const url = (path: string) => new URL(path, siteUrl).toString();

type LineItem = { productName: string; variantLabel: string; quantity: number; lineTotal: number };

export const emailTemplates = {
  orderConfirmation(p: {
    to: string; name: string; orderId: string; code: string; total: number; items: LineItem[];
    desiredDate?: string | null; timeSlot?: string | null; farmCount: number;
  }): EmailMessage {
    return {
      to: p.to,
      subject: `【ご注文ありがとうございます】注文番号 ${p.code}`,
      blocks: [
        { type: "p", text: `${p.name} 様\nご注文ありがとうございます。生産者が収穫・箱詰めの準備を始めます。` },
        { type: "table", rows: [
          ["注文番号", p.code],
          ...p.items.map((i) => [`${i.productName}（${i.variantLabel}）× ${i.quantity}`, formatYen(i.lineTotal)] as [string, string]),
          ["お支払い合計", formatYen(p.total)],
          ["お届け希望日", p.desiredDate ? formatDate(p.desiredDate) : "最短でお届け"],
          ["時間帯", deliveryTimeSlots[(p.timeSlot ?? "none") as DeliveryTimeSlot]?.label ?? "指定なし"],
        ] },
        ...(p.farmCount > 1 ? [{ type: "note" as const, text: `${p.farmCount}軒の農家さんからそれぞれ発送されます。` }] : []),
        { type: "button", label: "注文状況を確認する", href: url(routes.mypage.order(p.orderId)) },
      ],
    };
  },

  farmerNewOrder(p: { to: string; farmName: string; farmOrderId: string; code: string; subtotal: number; shipByDate: string | null; itemsSummary: string }): EmailMessage {
    return {
      to: p.to,
      subject: `【新規受注】${p.code}（出荷期限 ${p.shipByDate ? formatDate(p.shipByDate) : "-"}）`,
      blocks: [
        { type: "p", text: `${p.farmName} さま\n新しいご注文が入りました。` },
        { type: "table", rows: [["受注番号", p.code], ["内容", p.itemsSummary], ["商品代金", formatYen(p.subtotal)], ["出荷期限", p.shipByDate ? formatDate(p.shipByDate) : "-"]] },
        { type: "button", label: "受注を確認する", href: url(routes.farmer.order(p.farmOrderId)) },
      ],
    };
  },

  shipped(p: { to: string; name: string; orderId: string; farmName: string; carrier: Carrier; trackingNumber: string | null; eta: string | null }): EmailMessage {
    const c = carriers[p.carrier];
    return {
      to: p.to,
      subject: `【発送のお知らせ】${p.farmName}から商品を発送しました`,
      blocks: [
        { type: "p", text: `${p.name} 様\n${p.farmName} からご注文の商品を発送しました。到着まで今しばらくお待ちください。` },
        { type: "table", rows: [["配送業者", `${c.label}（${c.service}）`], ["追跡番号", p.trackingNumber ?? "-"], ["お届け予定", p.eta ? formatDate(p.eta) : "-"]] },
        ...(p.trackingNumber ? [{ type: "button" as const, label: "配送状況を追跡する", href: c.trackingUrl(p.trackingNumber) }] : []),
        { type: "note", text: "到着後は箱から出して、風通しの良い冷暗所で保存してください。" },
      ],
    };
  },

  reviewRequest(p: { to: string; name: string; farmName: string; productName: string; productSlug: string }): EmailMessage {
    return {
      to: p.to,
      subject: `${p.productName} はいかがでしたか？`,
      blocks: [
        { type: "p", text: `${p.name} 様\n先日お届けした「${p.productName}」はいかがでしたか？\nレビューは ${p.farmName} さんの大きな励みになります。` },
        { type: "button", label: "レビューを書く", href: url(`${routes.product(p.productSlug)}#reviews`) },
      ],
    };
  },

  shipReminder(p: { to: string; farmName: string; count: number; overdue: number }): EmailMessage {
    return {
      to: p.to,
      subject: `【出荷リマインド】明日までの出荷が${p.count}件あります`,
      blocks: [
        { type: "p", text: `${p.farmName} さま\n出荷期限が近いご注文が ${p.count} 件あります。${p.overdue ? `うち ${p.overdue} 件は期限を過ぎています。` : ""}` },
        { type: "button", label: "出荷センターを開く", href: url(routes.farmer.shipping) },
      ],
    };
  },

  farmApproved(p: { to: string; farmName: string }): EmailMessage {
    return {
      to: p.to,
      subject: "【出店承認】あわじ玉ねぎマルシェへようこそ",
      blocks: [
        { type: "p", text: `${p.farmName} さま\n出店申請を承認しました。商品を登録して販売を始めましょう。` },
        { type: "button", label: "ダッシュボードへ", href: url(routes.farmer.root) },
      ],
    };
  },

  payoutScheduled(p: { to: string; farmName: string; amount: number; scheduledFor: string; period: string }): EmailMessage {
    return {
      to: p.to,
      subject: `【精算確定】${p.period}分 ${formatYen(p.amount)}`,
      blocks: [
        { type: "p", text: `${p.farmName} さま\n${p.period}分の売上精算が確定しました。` },
        { type: "table", rows: [["お振込額", formatYen(p.amount)], ["お振込予定日", formatDate(p.scheduledFor)]] },
        { type: "button", label: "明細を見る", href: url(routes.farmer.payouts) },
      ],
    };
  },
};
