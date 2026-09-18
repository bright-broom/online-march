/** Static seed fixtures: farms, products, customers, review texts. */
import { images, type ImageKey } from "@/config/images";
import type { Carrier, FarmStatus, ProductCategory, ProductStatus } from "../schema/marketplace";

type SeedVariant = { label: string; grams: number; price: number; compareAt?: number; stock: number };
export type SeedProduct = {
  slug: string;
  name: string;
  category: ProductCategory;
  variety: string;
  summary: string;
  description: string;
  highlights: string[];
  cultivation: string;
  harvest: [number, number];
  status?: ProductStatus;
  featured?: boolean;
  images: ImageKey[];
  variants: SeedVariant[];
};
export type SeedFarm = {
  slug: string;
  name: string;
  tagline: string;
  story: string;
  owner: { name: string; email: string };
  representative: string;
  city: string;
  addressLine: string;
  postalCode: string;
  established: number;
  hero: ImageKey;
  avatar: ImageKey;
  gallery: ImageKey[];
  cultivation: string[];
  status: FarmStatus;
  carrier: Carrier;
  leadTimeDays: number;
  freeShippingThreshold: number | null;
  featured?: boolean;
  weight: number; // relative order volume
  products: SeedProduct[];
};


export const seedFarms: SeedFarm[] = [
  {
    slug: "awa-farm",
    name: "阿波ファーム",
    tagline: "三代つづく、吊り小屋熟成の玉ねぎ",
    story:
      "南あわじ市八木で祖父の代から玉ねぎをつくっています。収穫した玉ねぎは今も昔ながらの玉ねぎ小屋に吊るし、潮風でじっくり乾燥。手間はかかりますが、この甘さはほかでは出せないと自負しています。\n\n東京から戻ってきた息子と一緒に、畑の様子を発信しながら全国のみなさんに直接お届けしたいと、このマルシェを始めました。",
    owner: { name: "阿波 太一", email: "farmer@demo.awaji" },
    representative: "阿波 太一",
    city: "南あわじ市八木",
    addressLine: "養宜上 000",
    postalCode: "656-0441",
    established: 1958,
    hero: "fieldRows",
    avatar: "onionGolden",
    gallery: ["onionGolden2", "onionBasket", "onionPlants", "planting"],
    cultivation: ["hyogo_eco", "reduced"],
    status: "active",
    carrier: "yamato",
    leadTimeDays: 2,
    freeShippingThreshold: 8000,
    featured: true,
    weight: 3,
    products: [
      {
        slug: "awa-tsurigoya-tarzan",
        name: "吊り小屋熟成 淡路島たまねぎ「ターザン」",
        category: "onion",
        variety: "ターザン",
        summary: "玉ねぎ小屋で1か月以上吊るして熟成。甘みと旨みが凝縮した看板商品。",
        description:
          "晩生品種「ターザン」を、昔ながらの玉ねぎ小屋で自然乾燥させました。加熱するととろけるような甘さに。カレー、オニオンスープ、丸ごとレンジ蒸しがおすすめです。\n\nサイズは M〜L 混合。ご家庭用の簡易包装でお届けします。",
        highlights: ["吊り小屋で自然乾燥", "ひょうご安心ブランド認証", "加熱で糖度がぐっと上がる"],
        cultivation: "hyogo_eco",
        harvest: [6, 12],
        featured: true,
        images: ["onionGolden", "onionGolden2", "onionBasket", "onionYellow"],
        variants: [
          { label: "5kg（M・L混合）", grams: 5000, price: 2980, stock: 120 },
          { label: "10kg（M・L混合）", grams: 10000, price: 4980, compareAt: 5960, stock: 80 },
          { label: "20kg（M・L混合）", grams: 20000, price: 8800, compareAt: 11920, stock: 30 },
        ],
      },
      {
        slug: "awa-hatsuki-shintama",
        name: "葉付き新玉ねぎ（七宝早生7号）",
        category: "new_onion",
        variety: "七宝早生7号",
        summary: "春だけの限定品。葉まで甘く、生でかじれるみずみずしさ。",
        description:
          "3〜4月の短い期間だけ出荷する葉付きの新玉ねぎ。玉はスライスしてサラダに、葉はネギのように炒め物やぬたに。収穫当日に発送します。",
        highlights: ["収穫当日発送", "葉まで食べられる", "春限定"],
        cultivation: "reduced",
        harvest: [3, 4],
        images: ["onionLeaf", "onionSprout", "onionPlants"],
        variants: [
          { label: "3kg", grams: 3000, price: 2480, stock: 0 },
          { label: "5kg", grams: 5000, price: 3480, stock: 0 },
        ],
      },
      {
        slug: "awa-wakeari",
        name: "【訳あり】規格外 淡路島たまねぎ",
        category: "onion",
        variety: "ターザン",
        summary: "形やサイズが不揃いなだけ。味は正規品と同じです。",
        description:
          "皮のむけ・キズ・サイズ不揃いなどで市場に出せない玉ねぎです。味や品質は正規品と変わりません。たっぷり使いたい方、作り置きに。",
        highlights: ["フードロス削減", "たっぷり10kg", "味は正規品と同じ"],
        cultivation: "hyogo_eco",
        harvest: [6, 12],
        images: ["onionPile", "onionPile3", "onionMixed"],
        variants: [{ label: "10kg（サイズ混合）", grams: 10000, price: 3280, stock: 60 }],
      },
      {
        slug: "awa-tabekurabe-set",
        name: "食べ比べセット（黄玉・紫玉・小玉）",
        category: "set",
        variety: "その他",
        summary: "3種類の玉ねぎを少しずつ。はじめての方やギフトに。",
        description: "ターザン（黄）・猩々赤（紫）・ペコロス（小玉）の3種を詰め合わせました。レシピカード付き。",
        highlights: ["3品種の食べ比べ", "レシピカード付き", "のし対応"],
        cultivation: "reduced",
        harvest: [5, 11],
        featured: true,
        images: ["onionMixed", "onionRedTray", "onionPair"],
        variants: [{ label: "約4kg（3種）", grams: 4000, price: 4280, stock: 40 }],
      },
    ],
  },
  {
    slug: "matsuho-minato",
    name: "松帆みなと農園",
    tagline: "海を望む畑で、長期貯蔵のもみじ3号",
    story:
      "明石海峡を望む松帆の畑。冬の潮風を受けて育つ玉ねぎは、身がしまって日持ちが抜群です。年明けまでおいしく食べられる長期貯蔵品種に力を入れています。",
    owner: { name: "松帆 健二", email: "matsuho@demo.awaji" },
    representative: "松帆 健二",
    city: "南あわじ市松帆",
    addressLine: "古津路 000",
    postalCode: "656-0332",
    established: 1972,
    hero: "setoSea",
    avatar: "onionYellow",
    gallery: ["onionYellow", "onionPile2", "fieldCloudy"],
    cultivation: ["conventional"],
    status: "active",
    carrier: "yamato",
    leadTimeDays: 2,
    freeShippingThreshold: null,
    featured: true,
    weight: 2,
    products: [
      {
        slug: "matsuho-momiji3",
        name: "長期貯蔵 もみじ3号",
        category: "onion",
        variety: "もみじ3号",
        summary: "身がしまって日持ち抜群。冬まで楽しめる貯蔵玉ねぎ。",
        description: "長期保存に向いた「もみじ3号」。煮込んでも崩れにくく、甘みがしっかり出ます。",
        highlights: ["年末まで日持ち", "煮崩れしにくい", "L玉中心"],
        cultivation: "conventional",
        harvest: [7, 12],
        featured: true,
        images: ["onionYellow", "onionPile2", "onionGolden3"],
        variants: [
          { label: "5kg（L）", grams: 5000, price: 2780, stock: 150 },
          { label: "10kg（L）", grams: 10000, price: 4680, stock: 90 },
        ],
      },
      {
        slug: "matsuho-pecoros",
        name: "小玉たまねぎ（ペコロス）",
        category: "onion",
        variety: "その他",
        summary: "丸ごと煮込みやピクルスに。かわいい一口サイズ。",
        description: "直径3〜4cmの小玉。ポトフ、グラッセ、ピクルスに丸ごと使えます。",
        highlights: ["丸ごと使える", "煮込み料理に"],
        cultivation: "conventional",
        harvest: [6, 10],
        images: ["shallots", "onionPair"],
        variants: [{ label: "2kg", grams: 2000, price: 1980, stock: 45 }],
      },
    ],
  },
  {
    slug: "kashu-sakura",
    name: "賀集さくら農園",
    tagline: "農薬を減らし、土づくりから",
    story:
      "賀集の山すそで、牛ふん堆肥を使った土づくりから取り組んでいます。農薬と化学肥料を半分以下に抑えた特別栽培。贈答用の化粧箱もご用意しています。",
    owner: { name: "賀集 さくら", email: "kashu@demo.awaji" },
    representative: "賀集 さくら",
    city: "南あわじ市賀集",
    addressLine: "八幡 000",
    postalCode: "656-0514",
    established: 1990,
    hero: "farmersField",
    avatar: "onionSingle",
    gallery: ["onionPlants", "farmersField", "onionGolden3"],
    cultivation: ["reduced", "organic"],
    status: "active",
    carrier: "japanpost",
    leadTimeDays: 3,
    freeShippingThreshold: 10000,
    weight: 2,
    products: [
      {
        slug: "kashu-tokubetsu-saibai",
        name: "特別栽培 淡路島たまねぎ",
        category: "onion",
        variety: "淡路中甲高黄",
        summary: "農薬・化学肥料5割以上削減。安心して毎日食べられる玉ねぎ。",
        description: "在来系の「淡路中甲高黄」。昔ながらの甲高な形で、繊維がやわらかく生食にも向きます。",
        highlights: ["特別栽培（兵庫県認証）", "在来系品種", "生でもおいしい"],
        cultivation: "reduced",
        harvest: [6, 11],
        images: ["onionGolden3", "onionSingle", "onionPile3"],
        variants: [
          { label: "5kg", grams: 5000, price: 3280, stock: 70 },
          { label: "10kg", grams: 10000, price: 5680, stock: 40 },
        ],
      },
      {
        slug: "kashu-gift-box",
        name: "贈答用 化粧箱入り 淡路島たまねぎ（2L）",
        category: "set",
        variety: "ターザン",
        summary: "粒ぞろいの2L玉を化粧箱に。お中元・お歳暮に。",
        description: "選果した2L玉だけを化粧箱に詰めました。のし・メッセージカード無料。",
        highlights: ["2L玉のみ", "化粧箱", "のし無料"],
        cultivation: "reduced",
        harvest: [6, 12],
        featured: true,
        images: ["onionBasket2", "onionGolden", "onionPair"],
        variants: [
          { label: "5kg 化粧箱", grams: 5000, price: 4800, stock: 35 },
          { label: "10kg 化粧箱", grams: 10000, price: 7800, stock: 20 },
        ],
      },
    ],
  },
  {
    slug: "shichi-farm",
    name: "しちふぁーむ",
    tagline: "Uターン就農。紫玉ねぎと新しい食べ方を",
    story:
      "大阪で料理人をしていた店主が、実家の畑を継いでUターン。紫玉ねぎやサラダ向けの品種を中心に、料理人目線で『おいしい食べ方』も一緒にお届けします。",
    owner: { name: "志知 翔", email: "shichi@demo.awaji" },
    representative: "志知 翔",
    city: "南あわじ市志知",
    addressLine: "飯山寺 000",
    postalCode: "656-0461",
    established: 2019,
    hero: "onionRedPile",
    avatar: "onionRed",
    gallery: ["onionRedCrate", "onionRedSliced", "onionRedTray"],
    cultivation: ["reduced"],
    status: "active",
    carrier: "yamato",
    leadTimeDays: 1,
    freeShippingThreshold: 6000,
    weight: 2,
    products: [
      {
        slug: "shichi-shojo-aka",
        name: "紫玉ねぎ「猩々赤」",
        category: "red_onion",
        variety: "猩々赤",
        summary: "辛みが少なく、鮮やかな赤紫。サラダやマリネに。",
        description: "水にさらさなくても食べやすい紫玉ねぎ。酢に漬けると鮮やかなピンク色に。レシピカード付き。",
        highlights: ["生食向き", "ポリフェノール豊富", "料理人のレシピ付き"],
        cultivation: "reduced",
        harvest: [5, 8],
        featured: true,
        images: ["onionRed", "onionRedCrate", "onionRedSliced"],
        variants: [
          { label: "3kg", grams: 3000, price: 2380, stock: 55 },
          { label: "5kg", grams: 5000, price: 3380, stock: 30 },
        ],
      },
      {
        slug: "shichi-mix",
        name: "黄＆紫 ミックス玉ねぎ",
        category: "set",
        variety: "その他",
        summary: "黄玉と紫玉を半分ずつ。料理の幅が広がるセット。",
        description: "加熱向きの黄玉と、生食向きの紫玉を半量ずつ詰め合わせました。",
        highlights: ["2種類入り", "使い分けレシピ付き"],
        cultivation: "reduced",
        harvest: [5, 10],
        images: ["onionMixedDark", "onionMixed", "onionRedTray"],
        variants: [{ label: "5kg（黄2.5kg＋紫2.5kg）", grams: 5000, price: 3180, stock: 40 }],
      },
    ],
  },
  {
    slug: "fukura-seaside",
    name: "福良シーサイドファーム",
    tagline: "玉ねぎのおいしさを、一年中",
    story:
      "鳴門の渦潮で知られる福良。規格外の玉ねぎもおいしく食べてほしいと、自社加工場でスープやドレッシングをつくっています。",
    owner: { name: "福良 美咲", email: "fukura@demo.awaji" },
    representative: "福良 美咲",
    city: "南あわじ市福良",
    addressLine: "甲 000",
    postalCode: "656-0501",
    established: 2005,
    hero: "setoIslands",
    avatar: "onionSoup",
    gallery: ["onionSoup2", "onionSoupFrench", "onionRings"],
    cultivation: ["conventional"],
    status: "active",
    carrier: "yamato",
    leadTimeDays: 2,
    freeShippingThreshold: 5000,
    weight: 2,
    products: [
      {
        slug: "fukura-onion-soup",
        name: "淡路島オニオンスープ（10食）",
        category: "processed",
        variety: "その他",
        summary: "お湯を注ぐだけ。玉ねぎの甘みがとけ込んだ定番スープ。",
        description: "淡路島産玉ねぎを使ったフリーズドライスープ。常温で1年保存可能。ご贈答にも人気です。",
        highlights: ["お湯を注ぐだけ", "常温1年保存", "化学調味料不使用"],
        cultivation: "conventional",
        harvest: [1, 12],
        featured: true,
        images: ["onionSoup", "onionSoup2", "onionSoupFrench"],
        variants: [
          { label: "10食入り", grams: 400, price: 2160, stock: 200 },
          { label: "30食入り", grams: 1100, price: 5480, compareAt: 6480, stock: 80 },
        ],
      },
      {
        slug: "fukura-dressing",
        name: "たまねぎドレッシング 3本セット",
        category: "processed",
        variety: "その他",
        summary: "すりおろし玉ねぎたっぷり。サラダにも肉料理にも。",
        description: "玉ねぎを40%使用した、とろりと甘いドレッシング。300ml×3本。",
        highlights: ["玉ねぎ40%使用", "300ml×3本"],
        cultivation: "conventional",
        harvest: [1, 12],
        images: ["onionRedSliced", "onionSoupFrench"],
        variants: [{ label: "300ml×3本", grams: 1300, price: 2700, stock: 120 }],
      },
      {
        slug: "fukura-dry-onion",
        name: "フライドオニオン（100g×3袋）",
        category: "processed",
        variety: "その他",
        summary: "サクサク香ばしい。サラダ、カレー、ハンバーグに。",
        description: "淡路島玉ねぎを米油でじっくり揚げました。",
        highlights: ["米油使用", "チャック付き袋"],
        cultivation: "conventional",
        harvest: [1, 12],
        images: ["onionRings"],
        variants: [{ label: "100g×3袋", grams: 400, price: 1620, stock: 3 }],
      },
    ],
  },
  {
    slug: "jindai-kodawari",
    name: "神代こだわり農園",
    tagline: "自然栽培に挑戦中",
    story: "農薬・肥料を使わない自然栽培に取り組んでいます。出店申請中です。",
    owner: { name: "神代 誠", email: "jindai@demo.awaji" },
    representative: "神代 誠",
    city: "南あわじ市神代",
    addressLine: "地頭方 000",
    postalCode: "656-0472",
    established: 2021,
    hero: "fieldCloudy",
    avatar: "onionSprout",
    gallery: [],
    cultivation: ["natural"],
    status: "pending",
    carrier: "yamato",
    leadTimeDays: 3,
    freeShippingThreshold: null,
    weight: 0,
    products: [
      {
        slug: "jindai-shizen-saibai",
        name: "自然栽培 玉ねぎ",
        category: "onion",
        variety: "さつき",
        summary: "農薬・肥料不使用。",
        description: "準備中",
        highlights: [],
        cultivation: "natural",
        harvest: [6, 9],
        status: "draft",
        images: ["onionSprout"],
        variants: [{ label: "5kg", grams: 5000, price: 3980, stock: 20 }],
      },
    ],
  },
];

export const seedCustomers = [
  { name: "山田 花子", email: "customer@demo.awaji", pref: "東京都", city: "世田谷区", line1: "桜新町1-2-3", postal: "1540015" },
  { name: "佐藤 健", email: "sato@example.jp", pref: "大阪府", city: "大阪市北区", line1: "梅田2-4-9", postal: "5300001" },
  { name: "鈴木 美穂", email: "suzuki@example.jp", pref: "神奈川県", city: "横浜市港北区", line1: "日吉3-1-1", postal: "2230061" },
  { name: "高橋 誠", email: "takahashi@example.jp", pref: "愛知県", city: "名古屋市中区", line1: "栄3-5-12", postal: "4600008" },
  { name: "田中 由紀", email: "tanaka@example.jp", pref: "福岡県", city: "福岡市中央区", line1: "天神1-8-1", postal: "8100001" },
  { name: "伊藤 翔太", email: "ito@example.jp", pref: "北海道", city: "札幌市中央区", line1: "北一条西2-1", postal: "0600001" },
  { name: "渡辺 恵", email: "watanabe@example.jp", pref: "京都府", city: "京都市左京区", line1: "下鴨泉川町5", postal: "6060807" },
  { name: "中村 大輔", email: "nakamura@example.jp", pref: "宮城県", city: "仙台市青葉区", line1: "一番町4-1", postal: "9800811" },
  { name: "小林 さやか", email: "kobayashi@example.jp", pref: "広島県", city: "広島市中区", line1: "紙屋町1-2", postal: "7300031" },
  { name: "加藤 拓也", email: "kato@example.jp", pref: "埼玉県", city: "さいたま市浦和区", line1: "高砂2-3", postal: "3300063" },
  { name: "吉田 真理", email: "yoshida@example.jp", pref: "兵庫県", city: "神戸市中央区", line1: "三宮町1-1", postal: "6500021" },
  { name: "山本 和也", email: "yamamoto@example.jp", pref: "千葉県", city: "千葉市美浜区", line1: "中瀬1-3", postal: "2610023" },
  { name: "松本 彩", email: "matsumoto@example.jp", pref: "静岡県", city: "静岡市葵区", line1: "追手町9-6", postal: "4208601" },
  { name: "井上 隆", email: "inoue@example.jp", pref: "沖縄県", city: "那覇市", line1: "久茂地1-1-1", postal: "9000015" },
  { name: "木村 あゆみ", email: "kimura@example.jp", pref: "石川県", city: "金沢市", line1: "広坂1-1-1", postal: "9208577" },
  { name: "林 直樹", email: "hayashi@example.jp", pref: "岡山県", city: "岡山市北区", line1: "内山下2-4", postal: "7000824" },
];

export const reviewTexts: { rating: number; title: string; body: string }[] = [
  { rating: 5, title: "甘さにびっくり", body: "スライスして水にさらさずそのまま食べられました。子どもも「甘い！」と喜んでいます。" },
  { rating: 5, title: "リピートです", body: "去年に続いて2回目の注文。カレーが別物になります。今年も大満足です。" },
  { rating: 5, title: "丸ごとレンジが最高", body: "おすすめの丸ごとレンジ蒸しを試したら、とろとろで本当にスイーツのよう。" },
  { rating: 4, title: "新鮮でした", body: "届いてすぐに使いました。少しサイズがばらついていましたが味は文句なし。" },
  { rating: 5, title: "梱包も丁寧", body: "箱を開けたら手書きのメッセージが入っていて嬉しかったです。玉ねぎもつやつや。" },
  { rating: 5, title: "オニオンスープ絶品", body: "飴色玉ねぎにして作ったオニオンスープが感動の味でした。" },
  { rating: 4, title: "日持ちします", body: "1か月以上経ってもほとんど傷まず、最後までおいしく食べられました。" },
  { rating: 5, title: "贈り物に", body: "両親に贈ったらとても喜ばれました。化粧箱もきれいです。" },
  { rating: 3, title: "少し小さめ", body: "味は良いのですが、思っていたより小ぶりでした。" },
  { rating: 5, title: "サラダが主役に", body: "紫玉ねぎのマリネ、色がきれいで食卓が華やかになりました。" },
  { rating: 5, title: "農家さんの顔が見える", body: "ショップページで畑の様子が見られて、応援したくなりました。" },
  { rating: 4, title: "早く届いた", body: "注文から2日で届きました。追跡番号のメールも分かりやすかったです。" },
];

export const farmerReplies = [
  "ご購入ありがとうございます！今年は天候に恵まれて甘みがしっかり乗りました。またのご利用をお待ちしています。",
  "嬉しいお言葉ありがとうございます。励みになります！保存は吊るすのがおすすめです。",
  "ご意見ありがとうございます。サイズの選別をさらに丁寧にしてまいります。",
];

export const imageUrl = (key: ImageKey) => images[key];
