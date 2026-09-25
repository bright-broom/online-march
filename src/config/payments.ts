import { shippingPolicy } from "./shipping";

/**
 * 決済手段。Stripe Checkout は **dynamic payment methods** を使う（`payment_method_types` を送らない）ため、
 * 実際にお客さまへ表示されるのは Stripe ダッシュボード（設定 → 決済手段）で有効にしたものだけ。
 * ここはサイト側の「案内する決済手段」と、アプリが扱えるようにするための性質の定義。
 * 手順は docs/PAYMENTS.md §決済手段。
 */
export type PaymentMethodKind =
  /** 決済ページを離れた瞬間に入金が確定する（カード・ウォレット） */
  | "instant"
  /** 外部アプリへ遷移して支払う。戻ってきた時点で入金が確定する */
  | "redirect"
  /** 支払い番号だけ先に発行され、入金は後日（コンビニ払い等）。入金まで注文は pending_payment */
  | "deferred";

export type PaymentMethodInfo = {
  /** Stripe の payment method type（`charge.payment_method_details.type` と同じ値） */
  id: string;
  label: string;
  kind: PaymentMethodKind;
  /** 決済ページ・よくある質問で並べて案内するか（カード内包の Apple Pay 等は false） */
  listed: boolean;
};

export const paymentConfig = {
  methods: [
    { id: "card", label: "クレジットカード", kind: "instant", listed: true },
    { id: "paypay", label: "PayPay", kind: "redirect", listed: true },
    { id: "konbini", label: "コンビニ払い", kind: "deferred", listed: true },
    { id: "link", label: "Link（Stripe）", kind: "instant", listed: false },
    { id: "apple_pay", label: "Apple Pay", kind: "instant", listed: true },
    { id: "google_pay", label: "Google Pay", kind: "instant", listed: true },
    { id: "customer_balance", label: "銀行振込", kind: "deferred", listed: false },
  ] satisfies PaymentMethodInfo[] as PaymentMethodInfo[],
  /** カード会社ブランドの案内文（決済ページの補足） */
  cardBrands: "Visa / Mastercard / JCB / American Express / Diners Club",
  konbini: {
    /**
     * 支払い番号の有効期限（日）。自動キャンセルまでの猶予（asyncPaymentTtlDays）より短くする。
     * 逆だと「キャンセル済みの注文にお客さまが入金できてしまう」時間が生まれる。
     */
    expiresAfterDays: 3,
  },
  /** Checkout セッションの有効期限（分）= 未入金注文を自動キャンセルするまでの時間 */
  sessionTtlMinutes: shippingPolicy.pendingPaymentTtlMinutes,
} as const;

const byId = new Map(paymentConfig.methods.map((m) => [m.id, m]));

/** Stripe が返す payment method type を日本語ラベルに。未知の手段はそのまま表示する（決済は成立しているため） */
export const paymentMethodLabel = (id?: string | null) => (id ? (byId.get(id)?.label ?? id) : null);

/** 支払い番号だけ先に発行されるタイプ（入金待ちの案内が必要） */
export const isDeferredPaymentMethod = (id?: string | null) => Boolean(id && byId.get(id)?.kind === "deferred");

/** 決済ページ・FAQ で「ご利用いただけるお支払い方法」として並べる文言 */
export const listedPaymentMethodLabels = paymentConfig.methods.filter((m) => m.listed).map((m) => m.label);

if (paymentConfig.konbini.expiresAfterDays >= shippingPolicy.asyncPaymentTtlDays) {
  throw new Error("konbini.expiresAfterDays must be shorter than shippingPolicy.asyncPaymentTtlDays");
}

/** Stripe の決済画面で「戻る」を押したときの戻り先（/cart）に付けるクエリ。値は注文ID（#17） */
export const checkoutCanceledParam = "canceled_order";

/** 決済画面から戻ってきたときにカートに出す案内（#17）。キーは AbandonedCheckout["kind"] */
export const checkoutCanceledCopy = {
  cancelled: { title: "お支払いを中断しました", body: "ご注文は取り消しました（お代金はいただいていません）。カートの商品はそのまま残っていますので、もう一度ご注文いただけます。" },
  paid: { title: "お支払いは完了しています", body: "ご注文を受け付けました。確定までに少し時間がかかることがあります。ご注文の状況は注文履歴でご確認いただけます。" },
  awaiting_payment: { title: "お支払い番号を発行済みです", body: "期限までにコンビニでお支払いください。お支払いが確認できるとご注文が確定します。支払い番号は注文履歴でもご確認いただけます。" },
  not_pending: { title: "お支払いを中断しました", body: "カートの商品はそのまま残っています。ご注文の状況は注文履歴でご確認いただけます。" },
} as const;
