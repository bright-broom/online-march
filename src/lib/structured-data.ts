import { categories } from "@/config/catalog";
import { routes } from "@/config/nav";
import { siteConfig } from "@/config/site";
import type { ProductDetailDTO } from "@/server/queries/catalog";

/**
 * 商品ページの構造化データ（schema.org/Product）。Google のショッピングの表示（販売者のリスティング）が求める形:
 * 規格ごとの Offer（価格・在庫）と返品ポリシー。生鮮品のためお客さま都合の返品は受けない（config/content.ts の
 * cancellationPolicy と同じ内容。傷み・破損は返品ではなく返金・再送で対応する）。
 * URL と画像は絶対 URL にする（`abs` は components/shop/seo.ts#absUrl）。
 */
export function productStructuredData(p: ProductDetailDTO, abs: (path: string) => string) {
  const url = abs(routes.product(p.slug));
  const returnPolicy = {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "JP",
    returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
  };
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    description: p.summary || p.description,
    image: p.images.map((i) => abs(i.url)),
    category: categories[p.category]?.label,
    brand: { "@type": "Brand", name: p.farm.name },
    url,
    ...(p.variants.length
      ? {
          offers: p.variants.map((v) => ({
            "@type": "Offer",
            name: v.label,
            url,
            priceCurrency: "JPY",
            price: v.price,
            availability: p.status === "active" && v.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            itemCondition: "https://schema.org/NewCondition",
            seller: { "@type": "Organization", name: siteConfig.name },
            hasMerchantReturnPolicy: returnPolicy,
          })),
        }
      : {}),
    ...(p.ratingCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: Number((p.ratingSum / p.ratingCount).toFixed(1)),
            reviewCount: p.ratingCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
}

/** 運営者（schema.org/Organization）。トップページに出す。ロゴは PWA 用のアイコン（app/icons） */
export function organizationStructuredData(abs: (path: string) => string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.name,
    alternateName: siteConfig.nameEn,
    url: abs("/"),
    logo: abs("/icons/512"),
  };
}
