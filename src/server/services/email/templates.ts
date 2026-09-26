import "server-only";
import { routes } from "@/config/nav";
import { carriers, deliveryTimeSlots, type DeliveryTimeSlot } from "@/config/shipping";
import type { Carrier } from "@/db/schema";
import { siteConfig } from "@/config/site";
import { siteUrl } from "@/lib/env";
import { paymentMethodLabel } from "@/config/payments";
import { formatDate, formatDateTime, formatYen } from "@/lib/format";
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

  /** コンビニ払い等: 支払い番号が発行され、入金を待っている状態 */
  paymentPending(p: { to: string; name: string; orderId: string; code: string; total: number; method: string | null; voucherUrl: string | null; dueAt: Date | null }): EmailMessage {
    const method = paymentMethodLabel(p.method) ?? "お支払い";
    return {
      to: p.to,
      subject: `【お支払い方法のご案内】注文番号 ${p.code}`,
      blocks: [
        { type: "p", text: `${p.name} 様\nご注文ありがとうございます。${method}のお手続きが完了すると、生産者が準備を始めます。` },
        { type: "table", rows: [
          ["注文番号", p.code],
          ["お支払い方法", method],
          ["お支払い金額", formatYen(p.total)],
          ["お支払い期限", p.dueAt ? formatDateTime(p.dueAt) : "-"],
        ] },
        { type: "note", text: "期限までにお支払いがない場合、ご注文は自動的にキャンセルとなります。" },
        ...(p.voucherUrl ? [{ type: "button" as const, label: "お支払い番号を表示する", href: p.voucherUrl }] : []),
        { type: "button", label: "注文状況を確認する", href: url(routes.mypage.order(p.orderId)) },
      ],
    };
  },

  /** パスワード再設定。url は Better Auth が発行する1時間有効・1回限りのリンク */
  passwordReset(p: { to: string; name: string; url: string }): EmailMessage {
    return {
      to: p.to,
      subject: "【パスワード再設定のご案内】",
      blocks: [
        { type: "p", text: `${p.name} 様\nパスワード再設定のお申し込みを受け付けました。下のボタンから新しいパスワードを設定してください。` },
        { type: "button", label: "パスワードを再設定する", href: p.url },
        { type: "note", text: "このリンクの有効期限は1時間で、1回だけ使えます。お心当たりがない場合はこのメールを破棄してください。パスワードは変更されません。" },
      ],
    };
  },

  /** メッセージが届いた（#21）。本文は最初の数十文字だけ（全文はサイトで読む） */
  messageReceived(p: { to: string; fromName: string; preview: string; href: string }): EmailMessage {
    return {
      to: p.to,
      subject: `【メッセージ】${p.fromName}さんから届きました`,
      blocks: [
        { type: "p", text: `${p.fromName}さんからメッセージが届きました。\n\n「${p.preview}」` },
        { type: "button", label: "メッセージを読む・返信する", href: url(p.href) },
        { type: "note", text: "続けて届いたメッセージは、しばらくの間メールではお知らせしません。サイトのメッセージ画面でご確認ください。" },
      ],
    };
  },

  /** 生産者がレビューに返信した（#21） */
  reviewReplied(p: { to: string; name: string; farmName: string; productName: string; href: string }): EmailMessage {
    return {
      to: p.to,
      subject: `【レビューへの返信】${p.farmName}から返信が届きました`,
      blocks: [
        { type: "p", text: `${p.name} 様\n「${p.productName}」にお寄せいただいたレビューに、${p.farmName}から返信が届きました。` },
        { type: "button", label: "返信を読む", href: url(p.href) },
      ],
    };
  },

  /** 売上のお振込が済んだ（#21。Stripe の自動送金・運営の銀行振込のどちらも） */
  payoutPaid(p: { to: string; farmName: string; period: string; amount: number }): EmailMessage {
    return {
      to: p.to,
      subject: `【お振込完了】${p.period}分 ${formatYen(p.amount)}`,
      blocks: [
        { type: "p", text: `${p.farmName} さま\n${p.period}分の売上をお振込しました。` },
        { type: "table", rows: [["お振込額", formatYen(p.amount)]] },
        { type: "note", text: "口座への反映は金融機関によって1〜2営業日かかることがあります。" },
        { type: "button", label: "明細を見る", href: url(routes.farmer.payouts) },
      ],
    };
  },

  /** 運営への障害のお知らせ（#12）。本文は運営画面のお知らせと同じ */
  opsAlert(p: { to: string; title: string; body: string; href: string }): EmailMessage {
    return {
      to: p.to,
      subject: `【運営】${p.title}`,
      blocks: [
        { type: "p", text: p.body },
        { type: "button", label: "運営画面を開く", href: url(p.href) },
        { type: "note", text: "同じ内容のお知らせは一定時間まとめて送ります。詳しい内容は Vercel のログをエラーIDで検索してください。" },
      ],
    };
  },

  /** 登録時のメールアドレス確認（#16）。確認しなくても使えるが、注文確認やパスワード再設定が届くアドレスか確かめる */
  verifyEmail(p: { to: string; name: string; url: string }): EmailMessage {
    return {
      to: p.to,
      subject: "【メールアドレスのご確認】",
      blocks: [
        { type: "p", text: `${p.name} 様\nご登録ありがとうございます。下のボタンを押して、このメールアドレスでお知らせを受け取れることをご確認ください。` },
        { type: "button", label: "メールアドレスを確認する", href: p.url },
        { type: "note", text: "このリンクの有効期限は24時間です。お心当たりがない場合はこのメールを破棄してください。" },
      ],
    };
  },

  /** メールアドレス変更の確認（#16）。新しいアドレスへ送る。リンクを開くまでアドレスは変わらない */
  changeEmail(p: { to: string; name: string; url: string }): EmailMessage {
    return {
      to: p.to,
      subject: "【メールアドレス変更のご確認】",
      blocks: [
        { type: "p", text: `${p.name} 様\nメールアドレスの変更を受け付けました。下のボタンを押すと、ログインとお知らせのメールアドレスがこのアドレスに変わります。` },
        { type: "button", label: "このアドレスに変更する", href: p.url },
        { type: "note", text: "このリンクの有効期限は24時間です。ボタンを押すまでメールアドレスは変更されません。お心当たりがない場合はこのメールを破棄してください。" },
      ],
    };
  },

  /** 返金（運営の返金・生産者のキャンセル・お客さまのキャンセル、すべてここ） */
  refunded(p: { to: string; name: string; orderId: string; code: string; amount: number; reason: string | null; viaCard: boolean }): EmailMessage {
    return {
      to: p.to,
      subject: `【返金のお知らせ】注文番号 ${p.code}`,
      blocks: [
        { type: "p", text: `${p.name} 様\nご注文の返金手続きが完了しました。` },
        { type: "table", rows: [
          ["注文番号", p.code],
          ["返金額", formatYen(p.amount)],
          ...(p.reason ? [["理由", p.reason] as [string, string]] : []),
        ] },
        ...(p.viaCard
          ? [{ type: "note" as const, text: "ご利用のお支払い方法へ返金します。反映までの日数はカード会社・決済サービスによって異なります。" }]
          : []),
        { type: "button", label: "注文状況を確認する", href: url(routes.mypage.order(p.orderId)) },
      ],
    };
  },

  /** コンビニ払い等の期限切れ。お支払い番号を受け取った人にだけ送る */
  paymentExpired(p: { to: string; name: string; orderId: string; code: string }): EmailMessage {
    return {
      to: p.to,
      subject: `【ご注文キャンセルのお知らせ】注文番号 ${p.code}`,
      blocks: [
        { type: "p", text: `${p.name} 様\nお支払い期限までにご入金が確認できなかったため、ご注文をキャンセルしました。` },
        { type: "table", rows: [["注文番号", p.code]] },
        { type: "note", text: "引き続きご希望の場合は、お手数ですがもう一度ご注文ください。" },
        { type: "button", label: "注文状況を確認する", href: url(routes.mypage.order(p.orderId)) },
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
      subject: p.overdue ? `【至急】出荷期限を過ぎたご注文が${p.overdue}件あります` : `【出荷リマインド】明日までの出荷が${p.count}件あります`,
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

  /** 出店申請の見送り（#15）。内容を直せば /join から出し直せる */
  farmRejected(p: { to: string; name: string; farmName: string; reason?: string }): EmailMessage {
    return {
      to: p.to,
      subject: "【出店申請について】審査結果のお知らせ",
      blocks: [
        { type: "p", text: `${p.name} さま\n「${p.farmName}」の出店申請をご検討いただきありがとうございました。慎重に確認しましたが、今回は出店を見送らせていただきます。` },
        ...(p.reason ? [{ type: "p" as const, text: `運営からのメッセージ：\n${p.reason}` }] : []),
        { type: "note", text: `内容を見直して、出店申請ページからもう一度お申し込みいただけます。ご不明な点は ${siteConfig.contact.email} までお問い合わせください。` },
        { type: "button", label: "出店申請ページを開く", href: url(`${routes.join}#apply`) },
      ],
    };
  },

  /** 承認済みショップの一時停止（#15）。進行中の注文の出荷と精算は続く */
  farmSuspended(p: { to: string; farmName: string; reason?: string }): EmailMessage {
    return {
      to: p.to,
      subject: "【重要】ショップを一時停止しました",
      blocks: [
        { type: "p", text: `${p.farmName} さま\nショップを一時停止しました。停止中は商品がストアに表示されず、新しいご注文は入りません。` },
        ...(p.reason ? [{ type: "p" as const, text: `運営からのメッセージ：\n${p.reason}` }] : []),
        { type: "note", text: `進行中のご注文の発送は引き続き行え、その売上は通常どおり精算されます。ご不明な点は ${siteConfig.contact.email} までお問い合わせください。` },
        { type: "button", label: "ダッシュボードを開く", href: url(routes.farmer.root) },
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
