/**
 * Shipping master data (origin: 兵庫県南あわじ市). Pure data — logic lives in
 * src/server/services/shipping/*. See docs/SHIPPING.md.
 */
import type { Carrier } from "@/db/schema/marketplace";

export const carriers: Record<
  Carrier,
  {
    label: string;
    service: string;
    /** multiplier applied to the base (Yamato) rate table */
    rateFactor: number;
    trackingUrl: (trackingNumber: string) => string;
    /** CSV export format for the carrier's label software */
    csvFormat: "yamato_b2" | "japanpost_yupri" | "sagawa_ehiden";
    csvLabel: string;
  }
> = {
  yamato: {
    label: "ヤマト運輸",
    service: "宅急便",
    rateFactor: 1,
    trackingUrl: (n) =>
      `https://jizen.kuronekoyamato.co.jp/jizen/servlet/crjz.b.NQ0010?id=${encodeURIComponent(n)}`,
    csvFormat: "yamato_b2",
    csvLabel: "B2クラウド取込CSV",
  },
  japanpost: {
    label: "日本郵便",
    service: "ゆうパック",
    rateFactor: 0.97,
    trackingUrl: (n) =>
      `https://trackings.post.japanpost.jp/services/srv/search/?requestNo1=${encodeURIComponent(n)}&locale=ja`,
    csvFormat: "japanpost_yupri",
    csvLabel: "ゆうプリR取込CSV",
  },
  sagawa: {
    label: "佐川急便",
    service: "飛脚宅配便",
    rateFactor: 1.02,
    trackingUrl: (n) =>
      `https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo=${encodeURIComponent(n)}`,
    csvFormat: "sagawa_ehiden",
    csvLabel: "e飛伝Ⅲ取込CSV",
  },
};

/** Box sizes (3辺合計 cm) with the max onion weight we pack per box. */
export const boxSizes = [
  { size: 60, maxWeightGrams: 2_000 },
  { size: 80, maxWeightGrams: 5_000 },
  { size: 100, maxWeightGrams: 10_000 },
  { size: 120, maxWeightGrams: 15_000 },
  { size: 140, maxWeightGrams: 20_000 },
  { size: 160, maxWeightGrams: 25_000 },
] as const;
export type BoxSize = (typeof boxSizes)[number]["size"];

/** Packaging tare added per box (段ボール・緩衝材) */
export const packagingTareGrams = 400;

export const shippingZones = {
  kansai: {
    label: "関西",
    transitDays: 1,
    prefectures: ["滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"],
    rates: [940, 1230, 1530, 1850, 2180, 2500],
  },
  chugoku_shikoku: {
    label: "中国・四国",
    transitDays: 1,
    prefectures: ["鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県"],
    rates: [940, 1230, 1530, 1850, 2180, 2500],
  },
  chubu: {
    label: "中部・北陸・信越",
    transitDays: 1,
    prefectures: ["新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県"],
    rates: [1060, 1350, 1650, 1970, 2300, 2620],
  },
  kanto: {
    label: "関東",
    transitDays: 1,
    prefectures: ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"],
    rates: [1190, 1480, 1780, 2100, 2430, 2750],
  },
  kyushu: {
    label: "九州",
    transitDays: 1,
    prefectures: ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県"],
    rates: [1190, 1480, 1780, 2100, 2430, 2750],
  },
  tohoku: {
    label: "東北",
    transitDays: 2,
    prefectures: ["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"],
    rates: [1460, 1750, 2050, 2370, 2700, 3020],
  },
  hokkaido: {
    label: "北海道",
    transitDays: 2,
    prefectures: ["北海道"],
    rates: [1790, 2090, 2400, 2720, 3050, 3370],
  },
  okinawa: {
    label: "沖縄",
    transitDays: 3,
    prefectures: ["沖縄県"],
    rates: [1790, 2420, 3060, 3700, 4340, 4980],
  },
} as const;
export type ShippingZoneKey = keyof typeof shippingZones;

export const prefectures = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県",
  "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
] as const;
export type Prefecture = (typeof prefectures)[number];

/** 配達時間帯（ヤマト準拠。全キャリア共通キー） */
export const deliveryTimeSlots = {
  none: { label: "指定なし", yamato: "", japanpost: "", sagawa: "" },
  am: { label: "午前中", yamato: "0812", japanpost: "51", sagawa: "01" },
  "14-16": { label: "14〜16時", yamato: "1416", japanpost: "54", sagawa: "14" },
  "16-18": { label: "16〜18時", yamato: "1618", japanpost: "55", sagawa: "16" },
  "18-20": { label: "18〜20時", yamato: "1820", japanpost: "56", sagawa: "18" },
  "19-21": { label: "19〜21時", yamato: "1921", japanpost: "57", sagawa: "19" },
} as const;
export type DeliveryTimeSlot = keyof typeof deliveryTimeSlots;

/** Timings used by checkout & the automation cron (src/server/jobs). */
export const shippingPolicy = {
  /** 受付の一時停止（お休み）で選べる最長日数。年の打ち間違いでショップが黙って消えたままにならないように（#21） */
  maxPauseDays: 180,
  /** 送料無料ライン（農家ごとの設定が無い場合の既定値。null=なし） */
  defaultFreeShippingThreshold: null as number | null,
  /** 指定可能な最短お届け日 = 出荷可能日 + transitDays */
  desiredDateWindowDays: 21,
  /** 未入金注文の自動キャンセル（分） */
  pendingPaymentTtlMinutes: 60,
  /** コンビニ払い等（支払い番号発行済み・入金待ち）を待つ上限（日）。Stripe の既定期限3日＋余裕 */
  asyncPaymentTtlDays: 7,
  /** 出荷期限の前日にリマインド */
  shipByReminderHoursBefore: 24,
  /** 追跡API非対応時: 出荷後 N 日で自動「配達完了」 */
  autoDeliveredAfterDays: 3,
  /** 配達完了 N 日後にレビュー依頼メール */
  reviewRequestAfterDays: 3,
  /** 発送元（送り状の依頼主欄既定値は各農家の住所） */
  originPrefecture: "兵庫県" as Prefecture,
  itemName: "玉ねぎ（野菜）",
  handling: ["ナマモノ", "天地無用"] as const,
} as const;

/** のし表書き（ギフト指定） */
export const noshiOptions = ["無地", "御祝", "御礼", "内祝", "御中元", "御歳暮", "粗品", "志"] as const;
export type NoshiOption = (typeof noshiOptions)[number];
