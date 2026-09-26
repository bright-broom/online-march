import { Check, Leaf, Refrigerator } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RatingSummary } from "@/components/common/rating";
import { SectionHeading } from "@/components/common/section-heading";
import { CultivationBadge } from "@/components/shop/farm-card";
import { JsonLd } from "@/components/shop/json-ld";
import { ShopBreadcrumbs } from "@/components/shop/page-intro";
import { ProductGrid, ProductGridSkeleton } from "@/components/shop/product-card";
import { FarmMiniCard } from "@/components/shop/product/farm-mini-card";
import { HarvestMonths } from "@/components/shop/product/harvest-months";
import { ProductGallery } from "@/components/shop/product/product-gallery";
import { PurchasePanel } from "@/components/shop/product/purchase-panel";
import { ReviewsBlock, ReviewsSkeleton } from "@/components/shop/reviews";
import { absUrl } from "@/components/shop/seo";
import { categories, cultivationMethods, type CultivationKey } from "@/config/catalog";
import { routes, shopNav } from "@/config/nav";
import { siteConfig } from "@/config/site";
import {
  getProductBySlug,
  getProductReviews,
  getPublicProductSlugs,
  getRelatedProducts,
  type ProductDetailDTO,
} from "@/server/queries/catalog";

export async function generateStaticParams() {
  // Cache Components requires ≥1 param; an unknown placeholder renders notFound().
  // In `next dev` params are generated in a separate worker that cannot open the embedded
  // PGlite directory (single-process lock) — fall back to the placeholder instead of failing the route.
  const slugs = await getPublicProductSlugs().catch((err) => {
    console.warn("[generateStaticParams] falling back to placeholder:", err instanceof Error ? err.message : err);
    return [];
  });
  return slugs.length ? slugs.map(({ slug }) => ({ slug })) : [{ slug: "__placeholder__" }];
}

export async function generateMetadata({ params }: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p) return { title: "商品が見つかりません", robots: { index: false } };
  const title = `${p.name}｜${p.farm.name}`;
  const description = p.summary || p.description.slice(0, 120);
  return {
    title,
    description,
    alternates: { canonical: routes.product(p.slug) },
    openGraph: {
      type: "website",
      title,
      description,
      images: p.images.slice(0, 1).map((i) => ({ url: i.url, alt: i.alt })),
    },
    twitter: { card: "summary_large_image", title, description, images: p.images.slice(0, 1).map((i) => i.url) },
  };
}

const productsNavTitle = shopNav.find((n) => n.href === routes.products)?.title ?? "商品一覧";

function ProductJsonLd({ p }: { p: ProductDetailDTO }) {
  const prices = p.variants.map((v) => v.price);
  const inStock = p.status === "active" && p.variants.some((v) => v.stock > 0);
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "Product",
        name: p.name,
        description: p.summary || p.description,
        image: p.images.map((i) => i.url),
        category: categories[p.category]?.label,
        brand: { "@type": "Brand", name: p.farm.name },
        url: absUrl(routes.product(p.slug)),
        ...(prices.length
          ? {
              offers: {
                "@type": "AggregateOffer",
                priceCurrency: "JPY",
                lowPrice: Math.min(...prices),
                highPrice: Math.max(...prices),
                offerCount: p.variants.length,
                availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
                seller: { "@type": "Organization", name: siteConfig.name },
              },
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
      }}
    />
  );
}

/** 最初に出すレビューの数。続きは「もっと見る」（#21） */
const REVIEW_PAGE_SIZE = 20;

async function ProductReviews({ productId }: { productId: string }) {
  const { summary, items } = await getProductReviews(productId, REVIEW_PAGE_SIZE);
  return <ReviewsBlock summary={summary} items={items} emptyText="お届け後、購入された方がレビューを投稿できます。" more={{ productId, pageSize: REVIEW_PAGE_SIZE }} />;
}

async function RelatedProducts({ product }: { product: ProductDetailDTO }) {
  const related = await getRelatedProducts({ id: product.id, farmId: product.farm.id, category: product.category });
  if (!related.length) return null;
  return (
    <section className="border-t py-16 sm:py-20">
      <SectionHeading eyebrow="YOU MAY ALSO LIKE" title="こちらもおすすめ" />
      <ProductGrid products={related} className="mt-10" />
    </section>
  );
}

export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p) notFound();

  const cultivation = cultivationMethods[p.cultivation as CultivationKey];
  const category = categories[p.category];

  return (
    <div className="container-page pt-6 sm:pt-8">
      <ProductJsonLd p={p} />
      <ShopBreadcrumbs
        items={[
          { label: productsNavTitle, href: routes.products },
          ...(category ? [{ label: category.label, href: `${routes.products}?category=${p.category}` }] : []),
          { label: p.name },
        ]}
      />

      <div className="mt-6 grid gap-10 lg:mt-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16">
        <ProductGallery images={p.images} name={p.name} />

        <div className="space-y-7">
          <header className="space-y-4 motion-safe:animate-fade-up">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {category && (
                <Link
                  href={`${routes.products}?category=${p.category}`}
                  className="hover:border-foreground/30 rounded-full border px-2.5 py-0.5 transition-colors"
                >
                  {category.label}
                </Link>
              )}
              {p.variety && <span className="text-muted-foreground">品種：{p.variety}</span>}
              {cultivation && <CultivationBadge method={p.cultivation} />}
            </div>
            <h1 className="heading-display text-2xl leading-snug sm:text-3xl lg:text-[2.1rem]">{p.name}</h1>
            {p.summary && <p className="text-muted-foreground leading-relaxed">{p.summary}</p>}
            <a href="#reviews" className="inline-flex hover:opacity-80">
              <RatingSummary sum={p.ratingSum} count={p.ratingCount} />
            </a>
          </header>

          <PurchasePanel
            product={{
              id: p.id,
              slug: p.slug,
              name: p.name,
              status: p.status,
              variants: p.variants,
              farm: p.farm,
              imageUrl: p.images[0]?.url ?? null,
            }}
            pausedUntil={p.farm.pausedUntil}
          />
          <FarmMiniCard farm={p.farm} />
        </div>
      </div>

      <section className="mt-16 grid gap-12 border-t pt-14 sm:mt-24 sm:pt-20 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-16">
        <div className="space-y-10">
          {p.highlights.length > 0 && (
            <div>
              <p className="eyebrow">POINT</p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-3">
                {p.highlights.map((h) => (
                  <li key={h} className="bg-paper flex items-start gap-2.5 rounded-2xl p-4 text-sm leading-relaxed">
                    <Check className="text-primary mt-0.5 size-4 shrink-0" />
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h2 className="heading-display text-xl sm:text-2xl">商品について</h2>
            <p className="text-foreground/85 mt-5 max-w-prose text-[15px] leading-loose whitespace-pre-line">{p.description}</p>
          </div>
        </div>

        <aside className="space-y-6">
          {(p.harvestFrom || p.harvestTo) && (
            <div className="rounded-2xl border p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Leaf className="text-leaf size-4" />
                収穫・出荷時期
              </h2>
              <HarvestMonths from={p.harvestFrom} to={p.harvestTo} className="mt-4" />
            </div>
          )}
          {cultivation && (
            <div className="rounded-2xl border p-5">
              <h2 className="text-sm font-semibold">栽培方法</h2>
              <p className="mt-2 font-serif text-lg">{cultivation.label}</p>
              <p className="text-muted-foreground mt-1 text-sm">{cultivation.description}</p>
            </div>
          )}
          {p.storageTips && (
            <div className="rounded-2xl border p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Refrigerator className="text-sea size-4" />
                保存方法
              </h2>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed whitespace-pre-line">{p.storageTips}</p>
            </div>
          )}
        </aside>
      </section>

      <section id="reviews" className="scroll-mt-24 border-t py-16 sm:py-20">
        <SectionHeading eyebrow="REVIEWS" title="お客さまのレビュー" />
        <div className="mt-10">
          <Suspense fallback={<ReviewsSkeleton />}>
            <ProductReviews productId={p.id} />
          </Suspense>
        </div>
      </section>

      <Suspense fallback={<div className="border-t py-16"><ProductGridSkeleton count={4} /></div>}>
        <RelatedProducts product={p} />
      </Suspense>
    </div>
  );
}
