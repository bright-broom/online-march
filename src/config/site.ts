/** Brand & company master data. The single source for names, contact and legal info. */
export const siteConfig = {
  name: "あわじ玉ねぎマルシェ",
  shortName: "AWAJI MARCHÉ",
  nameEn: "Awaji Onion Marché",
  tagline: "南あわじの畑から、食卓へまっすぐ。",
  description:
    "淡路島・南あわじ市の玉ねぎ農家から直接届く産直マルシェ。甘くてやわらかい淡路島たまねぎを、生産者の顔が見えるかたちでお届けします。",
  keywords: ["淡路島 玉ねぎ", "南あわじ", "産直", "新玉ねぎ", "通販", "農家直送", "マルシェ"],
  locale: "ja_JP",
  region: "兵庫県南あわじ市",
  themeColor: { light: "#fbf7ef", dark: "#141312" },
  contact: {
    email: "hello@awaji-marche.example",
    phone: "0799-00-0000",
    hours: "平日 9:00〜17:00（土日祝・収穫繁忙期を除く）",
  },
  company: {
    /** 特定商取引法に基づく表記 — 運営開始前に実データへ差し替え */
    operator: "あわじ玉ねぎマルシェ運営事務局",
    representative: "代表者名（要設定）",
    /**
     * 適格請求書発行事業者の登録番号（T＋13桁, #10）。空の間は領収書・支払通知書に出さない。
     * 登録が済んだらここに入れる（本番公開チェックでも確認する）
     */
    invoiceRegistrationNumber: "",
    postalCode: "656-0000",
    address: "兵庫県南あわじ市（番地は請求があれば遅滞なく開示します）",
  },
  social: {
    instagram: "https://instagram.com/",
    x: "https://x.com/",
    line: "https://line.me/",
  },
} as const;

export type SiteConfig = typeof siteConfig;
