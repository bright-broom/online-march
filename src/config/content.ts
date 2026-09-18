/**
 * Marketing & editorial copy. Pages render these objects; edit copy here, not in JSX.
 * Tone: 飾らない・あたたかい・誠実（docs/DESIGN.md §Voice）
 */
import type { ImageKey } from "./images";

export const homeContent = {
  hero: {
    eyebrow: "兵庫県 南あわじ市から産地直送",
    title: ["潮風と太陽が育てた、", "淡路島のあまい玉ねぎ。"],
    lead: "畑を知る農家が、いちばんおいしい時期に収穫して、そのまま箱に詰めてお届けします。市場を通さないから、新鮮で、農家さんにもちゃんと届く。",
    primaryCta: { label: "玉ねぎをえらぶ", href: "/products" },
    secondaryCta: { label: "生産者に会いに行く", href: "/farms" },
    image: "heroSunset" as ImageKey,
    stats: [
      { value: "1日", label: "収穫から発送まで最短" },
      { value: "90%", label: "売上が農家さんへ" },
      { value: "47都道府県", label: "全国へお届け" },
    ],
  },
  values: {
    title: "あわじ玉ねぎマルシェの約束",
    items: [
      {
        icon: "Sprout",
        title: "農家さんから直接",
        body: "中間流通を通さず、畑から食卓へ。手数料は業界最安水準の10%。",
      },
      {
        icon: "Sun",
        title: "吊り小屋でじっくり熟成",
        body: "淡路島伝統の「玉ねぎ小屋」で自然乾燥。甘みがぐっと深まります。",
      },
      {
        icon: "Truck",
        title: "出荷まで自動でスムーズ",
        body: "注文が入ると出荷期限・送り状・追跡番号まで自動連携。届くまで見守れます。",
      },
      {
        icon: "MessageCircleHeart",
        title: "つくり手と話せる",
        body: "レシピの相談や保存方法、メッセージで農家さんに直接聞けます。",
      },
    ],
  },
  seasonal: {
    eyebrow: "SEASON",
    title: "いま、畑から届くもの",
    lead: "季節ごとに表情が変わる玉ねぎ。旬のおすすめを農家さんが選びました。",
  },
  farms: {
    eyebrow: "FARMERS",
    title: "南あわじの生産者",
    lead: "三代続く農家も、Uターンした若手も。それぞれの畑の物語があります。",
  },
  story: {
    eyebrow: "STORY",
    title: "なぜ淡路島の玉ねぎは甘いのか",
    body: [
      "瀬戸内の温暖な気候と、ミネラルを含んだ潮風。そして水はけのよい粘土質の土。",
      "秋に苗を植え、冬を越え、春から初夏にかけてゆっくりと育つことで、辛みが少なく糖度の高い玉ねぎになります。",
      "収穫後は「玉ねぎ小屋」に吊るして風で乾かす。手間のかかるこの伝統が、あの甘さを生んでいます。",
    ],
    image: "onionBasket" as ImageKey,
    cta: { label: "淡路島たまねぎについて", href: "/about" },
  },
  calendar: {
    eyebrow: "CALENDAR",
    title: "玉ねぎカレンダー",
    lead: "品種と時期で味わいが変わります。",
  },
  howItWorks: {
    eyebrow: "HOW IT WORKS",
    title: "ご注文からお届けまで",
    steps: [
      { icon: "ShoppingBasket", title: "えらぶ", body: "品種・サイズ・農家さんから選んでカートへ。" },
      { icon: "CalendarCheck", title: "日時を指定", body: "お届け希望日と時間帯を選べます。" },
      { icon: "Package", title: "収穫・箱詰め", body: "注文を受けてから農家さんが丁寧に詰めます。" },
      { icon: "Truck", title: "届く", body: "発送されたら追跡番号をメールでお知らせ。" },
    ],
  },
  reviews: { eyebrow: "VOICES", title: "お客さまの声" },
  joinCta: {
    title: "南あわじで玉ねぎを育てている方へ",
    body: "写真を撮って、価格を決めるだけ。受注・送り状・入金管理まで、スマホひとつで完結します。販売手数料は10%のみ、初期費用・月額費用は0円です。",
    cta: { label: "出店について詳しく", href: "/join" },
    image: "farmerWork" as ImageKey,
  },
} as const;

/** 玉ねぎカレンダー: month ranges per type (1-12) */
export const onionCalendar = [
  { label: "新玉ねぎ（極早生・早生）", from: 3, to: 5, tone: "chart-2" },
  { label: "中生・晩生（貯蔵）", from: 6, to: 12, tone: "chart-1" },
  { label: "紫玉ねぎ", from: 5, to: 8, tone: "chart-4" },
  { label: "葉付き玉ねぎ", from: 3, to: 4, tone: "chart-3" },
] as const;

export const aboutContent = {
  hero: {
    eyebrow: "ABOUT AWAJI ONION",
    title: "淡路島たまねぎのこと",
    lead: "日本の玉ねぎ生産量の約1割。明治から続く、島の誇りです。",
    image: "akashiBridge" as ImageKey,
  },
  sections: [
    {
      title: "瀬戸内の気候と土",
      body: "年間を通じて温暖で雨が少ない瀬戸内式気候。粘土質でミネラル豊富な土壌が、じっくりと玉ねぎを太らせます。",
      image: "fieldRows" as ImageKey,
    },
    {
      title: "冬を越える長い栽培期間",
      body: "秋に植え付け、春から初夏に収穫。一般的な産地より長く畑で過ごすことで、糖度が高く、繊維がやわらかく育ちます。",
      image: "onionPlants" as ImageKey,
    },
    {
      title: "玉ねぎ小屋での自然乾燥",
      body: "収穫した玉ねぎを小屋に吊るし、潮風で乾かします。余分な水分が抜け、甘みが凝縮され、日持ちも良くなります。",
      image: "onionGolden2" as ImageKey,
    },
  ],
  tips: {
    title: "おいしい食べ方・保存方法",
    items: [
      { title: "保存", body: "ネットに入れて風通しの良い冷暗所に吊るすのが理想。新玉ねぎは冷蔵庫の野菜室で。" },
      { title: "生で", body: "スライスして水にさらしすぎないのがコツ。甘みと香りが残ります。" },
      { title: "丸ごと", body: "皮ごとレンジやオーブンで。とろける甘さはまるでスイーツ。" },
    ],
  },
} as const;

export const guideContent = {
  title: "ご利用ガイド",
  sections: [
    {
      id: "order",
      title: "ご注文について",
      body: "会員登録（無料）のうえご注文ください。複数の農家さんの商品を一度にご注文いただけます。農家さんごとに発送されます。",
    },
    {
      id: "payment",
      title: "お支払い方法",
      body: "クレジットカード、Apple Pay、Google Pay、コンビニ払いに対応しています（Stripe による安全な決済）。",
    },
    {
      id: "shipping",
      title: "送料・お届け",
      body: "送料は農家さんごと・箱のサイズとお届け地域で自動計算されます。お届け希望日と時間帯を指定できます。",
    },
    {
      id: "cancel",
      title: "キャンセル・返品",
      body: "生鮮品のためお客様都合の返品はお受けできません。発送前であればマイページからキャンセルを申請できます。傷みなどがあった場合は到着後3日以内にご連絡ください。",
    },
    {
      id: "gift",
      title: "ギフト対応",
      body: "のし（無地・御中元・御歳暮など）とメッセージカードに対応しています。ご注文時に選択してください。",
    },
  ],
} as const;

export const faqContent = [
  {
    q: "いつ届きますか？",
    a: "ご注文後、農家さんの出荷準備日数（通常1〜3日）＋配送日数でお届けします。お届け予定日はカートと注文確認メールで確認できます。",
  },
  { q: "送料はいくらですか？", a: "農家さんごと・お届け地域・箱のサイズで自動計算されます。関西なら80サイズ（5kgまで）で1,230円からです。" },
  { q: "新玉ねぎと普通の玉ねぎは何が違いますか？", a: "新玉ねぎは収穫してすぐ出荷するため水分が多く、辛みが少なくやわらかいのが特徴。貯蔵玉ねぎは乾燥させることで甘みが深く、日持ちします。" },
  { q: "どのくらい日持ちしますか？", a: "貯蔵玉ねぎは風通しの良い冷暗所で1〜2か月。新玉ねぎは冷蔵で1〜2週間が目安です。" },
  { q: "傷んだものが届いた場合は？", a: "到着後3日以内にマイページの注文詳細から写真を添えてご連絡ください。農家さんと運営が対応します。" },
  { q: "領収書は発行できますか？", a: "マイページの注文詳細から領収書（PDF）を発行できます。" },
] as const;

export const joinContent = {
  hero: {
    eyebrow: "FOR FARMERS",
    title: "畑のこだわりを、そのまま全国へ。",
    lead: "南あわじ市とその周辺で玉ねぎを育てる生産者さんのための、手数料10%のオンライン直売所です。",
    image: "farmersField" as ImageKey,
  },
  benefits: [
    { icon: "Percent", title: "手数料は10%だけ", body: "初期費用・月額費用・掲載費は0円。売れたときだけ。" },
    { icon: "Smartphone", title: "スマホで出品", body: "写真を撮って、品種と価格を入れるだけ。" },
    { icon: "Truck", title: "出荷を自動化", body: "送り状CSV・追跡番号・発送メールを自動連携。" },
    { icon: "Wallet", title: "月末締め翌月15日払い", body: "売上と入金予定はダッシュボードで常に確認。" },
    { icon: "LineChart", title: "売上分析", body: "商品別・地域別の売れ行きをグラフで。" },
    { icon: "MessagesSquare", title: "ファンとつながる", body: "レビューへの返信やメッセージで常連さんに。" },
  ],
  steps: ["アカウント登録", "出店申請（農園情報）", "運営による確認（1〜3営業日）", "商品を登録して販売開始"],
} as const;

export const legalContent = {
  terms: "本規約は、あわじ玉ねぎマルシェ（以下「本サービス」）の利用条件を定めるものです。…（運営開始前に正式な利用規約へ差し替えてください）",
  privacy: "本サービスは、ご注文・配送・お問い合わせ対応のために必要な範囲で個人情報を取得し、生産者への配送情報の提供を除き、法令に基づく場合を除いて第三者に提供しません。…（正式版へ差し替えてください）",
} as const;
