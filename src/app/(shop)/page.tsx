import type { Metadata } from "next";
import { Suspense } from "react";
import { FarmCardSkeleton } from "@/components/shop/farm-card";
import { HomeCategoryTiles } from "@/components/shop/home/category-tiles";
import { HomeHero } from "@/components/shop/home/hero";
import { OnionCalendar } from "@/components/shop/home/onion-calendar";
import {
  HomeFarms,
  HomeFeaturedProducts,
  HomeHowItWorks,
  HomeJoinCta,
  HomeReviews,
  HomeStory,
} from "@/components/shop/home/sections";
import { HomeValues } from "@/components/shop/home/values";
import { JsonLd } from "@/components/shop/json-ld";
import { ProductGridSkeleton } from "@/components/shop/product-card";
import { absUrl } from "@/components/shop/seo";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: siteConfig.name,
          alternateName: siteConfig.nameEn,
          description: siteConfig.description,
          url: absUrl("/"),
          potentialAction: {
            "@type": "SearchAction",
            target: `${absUrl("/products")}?q={search_term_string}`,
            "query-input": "required name=search_term_string",
          },
        }}
      />
      <HomeHero />
      <HomeValues />
      <HomeCategoryTiles />
      <Suspense fallback={<div className="container-page py-16 sm:py-24"><ProductGridSkeleton /></div>}>
        <HomeFeaturedProducts />
      </Suspense>
      <OnionCalendar />
      <Suspense
        fallback={
          <div className="container-page grid gap-5 py-16 sm:grid-cols-2 sm:py-24 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => <FarmCardSkeleton key={i} />)}
          </div>
        }
      >
        <HomeFarms />
      </Suspense>
      <HomeStory />
      <HomeHowItWorks />
      <Suspense fallback={null}>
        <HomeReviews />
      </Suspense>
      <HomeJoinCta />
    </>
  );
}
