import { catalogSeoCopy, categories } from "@/config/catalog";
import { routes } from "@/config/nav";
import type { ProductCategory } from "@/db/schema";

/** /products の URL の状態のうち、検索エンジン向けの判定に使うもの（components/shop/catalog/catalog-params.ts と同じ意味） */
export type CatalogSeoInput = {
  q: string;
  category: ProductCategory | null;
  farm: string | null;
  cultivation: string | null;
  price: string | null;
  stock: boolean;
  sort: string;
  page: number;
};

/** 絞り込みなしの状態 */
export const catalogDefaults: CatalogSeoInput = { q: "", category: null, farm: null, cultivation: null, price: null, stock: false, sort: "recommended", page: 1 };

export type CatalogSeo = { title: string; description: string; canonical: string; index: boolean };

/**
 * 商品一覧の title・description・canonical・index を決める（config/catalog.ts#catalogSeoCopy）。
 * - カテゴリだけ（とページ送り）: そのカテゴリのページが正規。カテゴリごとの見出しと説明
 * - ほかの絞り込み・並び替え: カテゴリ（無ければ全商品）の1ページ目に寄せる（同じ商品の並べ替え違いを別ページとして数えさせない）
 * - サイト内検索（q）: 検索結果に出さない（noindex, follow）
 */
export function catalogSeo(p: CatalogSeoInput): CatalogSeo {
  const narrowed = Boolean(p.farm || p.cultivation || p.price || p.stock || p.sort !== "recommended");
  const page = narrowed || p.page < 2 ? 1 : p.page;
  const query = new URLSearchParams();
  if (p.category) query.set("category", p.category);
  if (page > 1) query.set("page", String(page));
  const canonical = query.size ? `${routes.products}?${query}` : routes.products;
  const cat = p.category ? categories[p.category] : null;
  const suffix = page > 1 ? catalogSeoCopy.pageSuffix(page) : "";
  return {
    title: (cat ? catalogSeoCopy.categoryTitle(cat.label) : catalogSeoCopy.allTitle) + suffix,
    description: cat ? catalogSeoCopy.categoryDescription(cat.label, cat.description) : catalogSeoCopy.allDescription,
    canonical,
    index: !p.q.trim(),
  };
}
