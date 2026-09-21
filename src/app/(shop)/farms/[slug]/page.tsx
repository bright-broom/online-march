import { MapPin, MessageCircle, PackageSearch } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { SectionHeading } from "@/components/common/section-heading";
import { FarmPausedNotice } from "@/components/shop/farm-paused-notice";
import { Button } from "@/components/ui/button";
import { CultivationBadge, FarmAvatar } from "@/components/shop/farm-card";
import { FollowButton } from "@/components/shop/follow-button";
import { JsonLd } from "@/components/shop/json-ld";
import { ShopBreadcrumbs } from "@/components/shop/page-intro";
import { ProductGrid, ProductGridSkeleton } from "@/components/shop/product-card";
import { ReviewsBlock, ReviewsSkeleton } from "@/components/shop/reviews";
import { absUrl } from "@/components/shop/seo";
import { images } from "@/config/images";
import { routes, shopNav } from "@/config/nav";
import { carriers } from "@/config/shipping";
import { formatRating } from "@/lib/format";
import { getFarmBySlug, getFarmProducts, getFarmReviews, getPublicFarmSlugs } from "@/server/queries/catalog";

export async function generateStaticParams() {
  // Cache Components requires ≥1 param; an unknown placeholder renders notFound().
  // In `next dev` params are generated in a separate worker that cannot open the embedded
  // PGlite directory (single-process lock) — fall back to the placeholder instead of failing the route.
  const slugs = await getPublicFarmSlugs().catch((err) => {
    console.warn("[generateStaticParams] falling back to placeholder:", err instanceof Error ? err.message : err);
    return [];
  });
  return slugs.length ? slugs.map(({ slug }) => ({ slug })) : [{ slug: "__placeholder__" }];
}

export async function generateMetadata({ params }: PageProps<"/farms/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const farm = await getFarmBySlug(slug);
  if (!farm) return { title: "生産者が見つかりません", robots: { index: false } };
  const description = farm.tagline || farm.story.slice(0, 120);
  const image = farm.heroImage ?? farm.avatarImage;
  return {
    title: farm.name,
    description,
    alternates: { canonical: routes.farm(farm.slug) },
    openGraph: { title: farm.name, description, images: image ? [{ url: image, alt: farm.name }] : undefined },
  };
}

const farmsNavTitle = shopNav.find((n) => n.href === routes.farms)?.title ?? "生産者";

async function FarmProducts({ farmId, farmName }: { farmId: string; farmName: string }) {
  const products = await getFarmProducts(farmId);
  if (!products.length) {
    return <EmptyState icon={PackageSearch} title="現在販売中の商品はありません" description={`${farmName}をフォローすると、新商品の入荷をお知らせします。`} className="border py-14" />;
  }
  return <ProductGrid products={products} />;
}

async function FarmReviews({ farmId }: { farmId: string }) {
  const { summary, items } = await getFarmReviews(farmId, 8);
  return <ReviewsBlock summary={summary} items={items} showProduct emptyText="この生産者の商品を購入された方のレビューがここに表示されます。" />;
}

export default async function FarmPage({ params }: PageProps<"/farms/[slug]">) {
  const { slug } = await params;
  const farm = await getFarmBySlug(slug);
  if (!farm) notFound();

  const carrier = carriers[farm.carrier];
  const stats = [
    { label: "創業", value: farm.establishedYear ? `${farm.establishedYear}年` : "—" },
    { label: "評価", value: farm.ratingCount ? `★${formatRating(farm.ratingSum, farm.ratingCount)}` : "—", note: farm.ratingCount ? `${farm.ratingCount}件` : undefined },
    { label: "商品数", value: `${farm.productCount}品` },
    { label: "出荷目安", value: `${farm.leadTimeDays}日以内`, note: carrier.label },
  ];

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: farm.name,
          description: farm.tagline,
          url: absUrl(routes.farm(farm.slug)),
          image: farm.heroImage ?? undefined,
          logo: farm.avatarImage ?? undefined,
          foundingDate: farm.establishedYear ? String(farm.establishedYear) : undefined,
          address: { "@type": "PostalAddress", addressRegion: farm.prefecture, addressLocality: farm.city, addressCountry: "JP" },
          ...(farm.ratingCount
            ? { aggregateRating: { "@type": "AggregateRating", ratingValue: Number(formatRating(farm.ratingSum, farm.ratingCount)), reviewCount: farm.ratingCount } }
            : {}),
        }}
      />

      {/* hero banner */}
      <section className="relative isolate h-[42svh] min-h-72 overflow-hidden sm:h-[52svh]">
        <Image src={farm.heroImage ?? images.fieldRows} alt="" fill priority sizes="100vw" className="-z-10 object-cover" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-black/25" />
        <div className="container-page relative pt-6">
          <ShopBreadcrumbs items={[{ label: farmsNavTitle, href: routes.farms }, { label: farm.name }]} inverted />
        </div>
      </section>

      <div className="container-page">
        <header className="relative -mt-16 flex flex-col gap-6 sm:-mt-20 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
            <FarmAvatar src={farm.avatarImage} name={farm.name} className="size-28 ring-8 sm:size-36" />
            <div className="space-y-2 pb-1 motion-safe:animate-fade-up">
              <p className="text-muted-foreground flex items-center gap-1 text-xs">
                <MapPin className="size-3.5" />
                {farm.prefecture}
                {farm.city}
              </p>
              <h1 className="heading-display text-3xl sm:text-4xl">{farm.name}</h1>
              <p className="text-muted-foreground max-w-xl text-sm leading-relaxed sm:text-base">{farm.tagline}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pb-1">
            <FollowButton farmId={farm.id} farmName={farm.name} />
            <Button asChild variant="outline" className="h-10 rounded-full px-5">
              <Link href={`${routes.mypage.messages}?f=${farm.id}`}>
                <MessageCircle />
                メッセージを送る
              </Link>
            </Button>
          </div>
        </header>

        <FarmPausedNotice farmName={farm.name} pausedUntil={farm.pausedUntil} />

        <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-card px-5 py-4">
              <dt className="text-muted-foreground text-xs">{s.label}</dt>
              <dd className="mt-1 flex items-baseline gap-1.5">
                <span className="font-display text-xl font-medium sm:text-2xl">{s.value}</span>
                {s.note && <span className="text-muted-foreground text-xs">{s.note}</span>}
              </dd>
            </div>
          ))}
        </dl>

        <section className="grid gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-16">
          <div>
            <p className="eyebrow">STORY</p>
            <h2 className="heading-display mt-3 text-2xl sm:text-3xl">畑のこと、つくり手のこと</h2>
            <p className="text-foreground/85 mt-6 max-w-prose text-[15px] leading-loose whitespace-pre-line">{farm.story}</p>
            {farm.cultivationMethods.length > 0 && (
              <div className="mt-8 flex flex-wrap gap-2">
                {farm.cultivationMethods.map((m) => (
                  <CultivationBadge key={m} method={m} className="px-3 py-1 text-xs" />
                ))}
              </div>
            )}
            <p className="text-muted-foreground mt-8 text-xs">代表：{farm.representative}</p>
          </div>
          {farm.gallery.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 self-start">
              {farm.gallery.slice(0, 4).map((src, i) => (
                <li key={src + i} className={i === 0 ? "col-span-2" : undefined}>
                  <div className={`bg-muted relative overflow-hidden rounded-2xl ${i === 0 ? "aspect-[16/10]" : "aspect-square"}`}>
                    <Image src={src} alt={`${farm.name}の写真 ${i + 1}`} fill sizes={i === 0 ? "(min-width: 1024px) 40vw, 92vw" : "(min-width: 1024px) 20vw, 46vw"} className="object-cover" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border-t py-16 sm:py-20">
          <SectionHeading eyebrow="PRODUCTS" title={`${farm.name}の商品`} />
          <div className="mt-10">
            <Suspense fallback={<ProductGridSkeleton count={4} />}>
              <FarmProducts farmId={farm.id} farmName={farm.name} />
            </Suspense>
          </div>
        </section>

        <section id="reviews" className="scroll-mt-24 border-t py-16 sm:py-20">
          <SectionHeading eyebrow="REVIEWS" title="お客さまのレビュー" />
          <div className="mt-10">
            <Suspense fallback={<ReviewsSkeleton />}>
              <FarmReviews farmId={farm.id} />
            </Suspense>
          </div>
        </section>
      </div>
    </>
  );
}
