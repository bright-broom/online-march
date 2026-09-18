import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { OnionCalendar } from "@/components/shop/home/onion-calendar";
import { ImageHero } from "@/components/shop/page-intro";
import { Button } from "@/components/ui/button";
import { aboutContent, homeContent } from "@/config/content";
import { images } from "@/config/images";
import { routes } from "@/config/nav";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: aboutContent.hero.title,
  description: aboutContent.hero.lead,
  alternates: { canonical: routes.about },
  openGraph: { images: [{ url: images[aboutContent.hero.image] }] },
};

export default function AboutPage() {
  const { hero, sections, tips } = aboutContent;
  return (
    <>
      <ImageHero image={images[hero.image]} crumbs={[{ label: hero.title }]} eyebrow={hero.eyebrow} title={hero.title} lead={hero.lead} />

      <div className="container-page space-y-20 py-16 sm:space-y-28 sm:py-24">
        {sections.map((s, i) => (
          <section key={s.title} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
            <div className={cn("bg-muted relative aspect-[4/3] overflow-hidden rounded-3xl", i % 2 === 1 && "lg:order-2")}>
              <Image src={images[s.image]} alt="" fill sizes="(min-width: 1024px) 45vw, 92vw" className="object-cover" />
            </div>
            <div className="space-y-5">
              <p className="font-display text-primary text-5xl font-light">0{i + 1}</p>
              <h2 className="heading-display text-2xl sm:text-3xl">{s.title}</h2>
              <p className="text-foreground/85 max-w-prose text-[15px] leading-loose">{s.body}</p>
            </div>
          </section>
        ))}
      </div>

      <OnionCalendar />

      <section className="container-page py-16 sm:py-24">
        <h2 className="heading-display text-center text-2xl sm:text-3xl">{tips.title}</h2>
        <ul className="mt-12 grid gap-5 sm:grid-cols-3">
          {tips.items.map((t) => (
            <li key={t.title} className="bg-card rounded-2xl border p-6">
              <p className="font-serif text-lg font-semibold">{t.title}</p>
              <p className="text-muted-foreground mt-3 text-sm leading-relaxed">{t.body}</p>
            </li>
          ))}
        </ul>
        <div className="mt-14 flex justify-center">
          <Button asChild className="h-12 rounded-full px-7">
            <Link href={homeContent.hero.primaryCta.href}>
              {homeContent.hero.primaryCta.label}
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
