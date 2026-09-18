/** Product catalog vocabulary: categories, varieties, cultivation, sort/filter options. */
import type { ProductCategory } from "@/db/schema/marketplace";
import type { ImageKey } from "./images";

export const categories: Record<
  ProductCategory,
  { label: string; description: string; image: ImageKey }
> = {
  onion: {
    label: "玉ねぎ（貯蔵）",
    description: "吊り小屋で乾燥熟成させた、甘みの深い定番の淡路島たまねぎ。",
    image: "onionGolden",
  },
  new_onion: {
    label: "新玉ねぎ",
    description: "春だけの採れたて。みずみずしく辛みが少なく、生でサラダに。",
    image: "onionLeaf",
  },
  red_onion: {
    label: "紫玉ねぎ",
    description: "鮮やかな赤紫。マリネやサラダの彩りに。",
    image: "onionRed",
  },
  processed: {
    label: "加工品",
    description: "オニオンスープ、ドレッシング、ドライオニオンなど。",
    image: "onionSoup",
  },
  set: {
    label: "セット・ギフト",
    description: "食べ比べや贈り物に。のし・メッセージ対応。",
    image: "onionBasket",
  },
};

export const categoryKeys = Object.keys(categories) as ProductCategory[];

/** 南あわじで主に栽培される品種 */
export const varieties = [
  "七宝早生7号",
  "ターザン",
  "もみじ3号",
  "アトン",
  "淡路中甲高黄",
  "さつき",
  "猩々赤",
  "その他",
] as const;

export const cultivationMethods = {
  conventional: { label: "慣行栽培", description: "兵庫県の基準に沿った栽培" },
  reduced: { label: "特別栽培", description: "農薬・化学肥料を5割以上削減" },
  hyogo_eco: { label: "ひょうご安心ブランド", description: "残留農薬が国基準の1/10以下" },
  organic: { label: "有機栽培", description: "有機JAS認証" },
  natural: { label: "自然栽培", description: "農薬・肥料不使用" },
} as const;
export type CultivationKey = keyof typeof cultivationMethods;

export const sizeGrades = ["S", "M", "L", "2L", "3L", "混合"] as const;

export const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1}月` }));

export const productSortOptions = {
  recommended: { label: "おすすめ順" },
  newest: { label: "新着順" },
  popular: { label: "人気順" },
  rating: { label: "評価の高い順" },
  price_asc: { label: "価格の安い順" },
  price_desc: { label: "価格の高い順" },
} as const;
export type ProductSort = keyof typeof productSortOptions;

export const priceRanges = [
  { key: "u2000", label: "〜2,000円", min: 0, max: 2000 },
  { key: "2000-4000", label: "2,000〜4,000円", min: 2000, max: 4000 },
  { key: "4000-7000", label: "4,000〜7,000円", min: 4000, max: 7000 },
  { key: "o7000", label: "7,000円〜", min: 7000, max: Number.MAX_SAFE_INTEGER },
] as const;

/** Variants removed by a farmer but referenced by past orders are soft-removed by pushing sortOrder ≥ this. */
export const REMOVED_VARIANT_SORT = 10_000;

export const catalogLimits = {
  pageSize: 12,
  maxImagesPerProduct: 8,
  maxVariantsPerProduct: 6,
  maxImageBytes: 8 * 1024 * 1024,
  acceptedImageTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
  lowStockThreshold: 5,
} as const;
