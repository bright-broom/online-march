import { describe, expect, it, vi } from "vitest";

/**
 * 検索エンジン向け（2026-09-27）:
 * - カテゴリだけの商品一覧は検索の入口なので、それぞれを正規のページ（canonical）にしてサイトマップにも載せる
 * - ほかの絞り込み・並び替えはカテゴリ（無ければ全商品）に寄せる。サイト内検索の結果は検索に出さない
 * - 商品の構造化データは規格ごとの Offer と返品ポリシー（Google の販売者のリスティングの形）
 */
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn(), cacheTag: vi.fn(), cacheLife: vi.fn() }));

const { catalogSeo, catalogDefaults } = await import("../catalog-seo");
const { productStructuredData, organizationStructuredData } = await import("../structured-data");
const { categories } = await import("@/config/catalog");

const abs = (path: string) => new URL(path, "https://awaji.example").toString();

describe("商品一覧の canonical と index", () => {
  it("絞り込みなしは全商品の一覧が正規", () => {
    expect(catalogSeo(catalogDefaults)).toMatchObject({ canonical: "/products", index: true, title: "商品一覧" });
  });

  it("カテゴリだけなら、そのカテゴリのページが正規で、見出しと説明もカテゴリのもの", () => {
    const seo = catalogSeo({ ...catalogDefaults, category: "new_onion" });
    expect(seo.canonical).toBe("/products?category=new_onion");
    expect(seo.index).toBe(true);
    expect(seo.title).toContain(categories.new_onion.label);
    expect(seo.description).toContain(categories.new_onion.description);
  });

  it("ページ送りはそのページ自身が正規（2ページ目以降の商品も見つけてもらう）", () => {
    expect(catalogSeo({ ...catalogDefaults, category: "onion", page: 2 })).toMatchObject({ canonical: "/products?category=onion&page=2", index: true });
    expect(catalogSeo({ ...catalogDefaults, page: 3 }).canonical).toBe("/products?page=3");
  });

  it("ほかの絞り込み・並び替えは、カテゴリ（無ければ全商品）の1ページ目に寄せる", () => {
    expect(catalogSeo({ ...catalogDefaults, category: "onion", sort: "price_asc", page: 2 }).canonical).toBe("/products?category=onion");
    expect(catalogSeo({ ...catalogDefaults, farm: "awa-farm" }).canonical).toBe("/products");
    expect(catalogSeo({ ...catalogDefaults, category: "set", stock: true }).canonical).toBe("/products?category=set");
  });

  it("サイト内検索の結果は検索に出さない", () => {
    expect(catalogSeo({ ...catalogDefaults, q: "ターザン" }).index).toBe(false);
    expect(catalogSeo({ ...catalogDefaults, q: "   " }).index).toBe(true);
  });
});

describe("サイトマップ", () => {
  it("カテゴリごとの一覧を載せる", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = (await sitemap()).map((e) => e.url);
    for (const key of Object.keys(categories)) expect(urls.some((u) => u.endsWith(`/products?category=${key}`))).toBe(true);
  });
});

describe("構造化データ", () => {
  const product = {
    id: "p1", slug: "tarzan", name: "ターザン", category: "onion", variety: "", summary: "甘い", description: "説明", highlights: [],
    cultivation: "", storageTips: "", harvestFrom: null, harvestTo: null, status: "active", ratingSum: 9, ratingCount: 2, soldCount: 0,
    updatedAt: "", images: [{ url: "/uploads/a.jpg", alt: "" }],
    variants: [
      { id: "v1", label: "5kg", weightGrams: 5000, price: 2980, compareAt: null, stock: 3, isDefault: true },
      { id: "v2", label: "10kg", weightGrams: 10000, price: 4980, compareAt: null, stock: 0, isDefault: false },
    ],
    farm: { name: "阿波ファーム" },
  } as unknown as Parameters<typeof productStructuredData>[0];

  it("規格ごとに価格と在庫を出し、返品ポリシー（お客さま都合の返品は受けない）を付ける。画像は絶対 URL", () => {
    const data = productStructuredData(product, abs) as { offers: Record<string, unknown>[]; image: string[] };
    expect(data.offers).toHaveLength(2);
    expect(data.offers[0]).toMatchObject({ "@type": "Offer", price: 2980, priceCurrency: "JPY", availability: "https://schema.org/InStock" });
    expect(data.offers[1]).toMatchObject({ price: 4980, availability: "https://schema.org/OutOfStock" });
    expect(data.offers[0].hasMerchantReturnPolicy).toMatchObject({ applicableCountry: "JP", returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted" });
    expect(data.image).toEqual(["https://awaji.example/uploads/a.jpg"]);
  });

  it("売り切れの商品は在庫があっても在庫なし", () => {
    const data = productStructuredData({ ...product, status: "soldout" }, abs) as { offers: { availability: string }[] };
    expect(data.offers.every((o) => o.availability === "https://schema.org/OutOfStock")).toBe(true);
  });

  it("運営者はロゴつきの Organization", () => {
    expect(organizationStructuredData(abs)).toMatchObject({ "@type": "Organization", url: "https://awaji.example/", logo: "https://awaji.example/icons/512" });
  });
});
