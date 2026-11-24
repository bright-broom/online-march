import Image from "next/image";
import Link from "next/link";
import { RatingStars } from "@/components/common/rating";
import { SectionHeading } from "@/components/common/section-heading";
import { Button } from "@/components/ui/button";
import { homeContent } from "@/config/content";
import { images } from "@/config/images";
import { routes } from "@/config/nav";
import { getFeaturedFarms, getFeaturedProducts, getReviewHighlights } from "@/server/queries/catalog";
import { FarmCard } from "../farm-card";
import { ProductGrid } from "../product-card";

function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-primary shrink-0 text-sm font-medium underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}

export async function HomeFeaturedProducts() {
  const products = await getFeaturedProducts(8);
  if (!products.length) return null;
  return (
    <section className="container-page py-16 sm:py-24">
      <SectionHeading
        title="農家さんのおすすめ"
        lead="いまの時期にいちばんおいしい玉ねぎを、生産者が選びました。"
        action={<MoreLink href={routes.products}>すべての商品</MoreLink>}
      />
      <ProductGrid products={products} className="mt-10" />
    </section>
  );
}

export async function HomeFarms() {
  const { farms: copy } = homeContent;
  const farms = await getFeaturedFarms(3);
  if (!farms.length) return null;
  return (
    <section className="container-page py-16 sm:py-24">
      <SectionHeading
        title={copy.title}
        lead={copy.lead}
        action={<MoreLink href={routes.farms}>生産者一覧</MoreLink>}
      />
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {farms.map((f) => (
          <FarmCard key={f.id} farm={f} />
        ))}
      </div>
    </section>
  );
}

export function HomeStory() {
  const { story } = homeContent;
  return (
    <section className="bg-sea text-sea-foreground overflow-hidden">
      <div className="container-page grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-2 lg:gap-16">
        <div className="relative aspect-[4/5] overflow-hidden rounded-3xl sm:aspect-[5/4] lg:aspect-[4/5]">
          <Image src={images[story.image]} alt="" fill sizes="(min-width: 1024px) 45vw, 92vw" className="object-cover" />
        </div>
        <div className="space-y-6">
          <h2 className="heading-display text-3xl leading-snug sm:text-4xl">{story.title}</h2>
          <div className="text-sea-foreground/85 space-y-4 text-[15px] leading-loose">
            {story.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <Button
            asChild
            variant="outline"
            className="border-sea-foreground/30 hover:bg-sea-foreground/10 text-sea-foreground hover:text-sea-foreground h-11 rounded-full bg-transparent px-6 dark:bg-transparent"
          >
            <Link href={story.cta.href}>{story.cta.label}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function HomeHowItWorks() {
  const { howItWorks } = homeContent;
  return (
    <section className="container-page py-16 sm:py-24">
      <SectionHeading title={howItWorks.title} />
      <ol className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
        {howItWorks.steps.map((s, i) => (
          <li key={s.title} className="border-t pt-4">
            <p className="text-muted-foreground text-sm tabular-nums">{i + 1}.</p>
            <h3 className="mt-1 font-semibold">{s.title}</h3>
            <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export async function HomeReviews() {
  const { reviews: copy } = homeContent;
  const reviews = await getReviewHighlights(6);
  if (!reviews.length) return null;
  return (
    <section className="bg-paper border-y">
      <div className="container-page py-16 sm:py-24">
        <SectionHeading title={copy.title} />
        <ul className="mt-10 columns-1 gap-5 sm:columns-2 lg:columns-3 [&>li]:mb-5 [&>li]:break-inside-avoid">
          {reviews.map((r) => (
            <li key={r.id} className="bg-card rounded-2xl border p-6">
              <RatingStars value={r.rating} />
              {r.title && <p className="mt-4 font-serif text-base font-semibold">{r.title}</p>}
              <p className="text-foreground/85 mt-2 line-clamp-6 text-sm leading-relaxed">{r.body}</p>
              <p className="text-muted-foreground mt-4 text-xs">
                {r.author}・
                <Link href={routes.product(r.product.slug)} className="hover:text-primary underline-offset-4 hover:underline">
                  {r.product.name}
                </Link>
              </p>
              {r.reply && (
                <div className="bg-paper mt-4 rounded-xl p-4">
                  <p className="text-primary text-xs font-semibold">{r.farm.name}より</p>
                  <p className="text-muted-foreground mt-1 line-clamp-4 text-xs leading-relaxed">{r.reply}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function HomeJoinCta() {
  const { joinCta } = homeContent;
  return (
    <section className="container-page py-16 sm:py-24">
      <div className="bg-sea text-sea-foreground relative isolate overflow-hidden rounded-3xl">
        <Image src={images[joinCta.image]} alt="" fill sizes="(min-width: 1280px) 1216px, 100vw" className="-z-20 object-cover opacity-40" />
        {/* 文字を読めるようにするための暗幕（飾りではない） */}
        <div aria-hidden className="bg-sea/80 absolute inset-0 -z-10" />
        <div className="max-w-2xl space-y-5 px-6 py-14 sm:px-12 sm:py-20">
          <h2 className="heading-display text-2xl leading-snug sm:text-3xl lg:text-4xl">{joinCta.title}</h2>
          <p className="text-sea-foreground/85 text-sm leading-relaxed sm:text-base">{joinCta.body}</p>
          <Button asChild className="h-12 rounded-full px-7">
            <Link href={joinCta.cta.href}>{joinCta.cta.label}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
