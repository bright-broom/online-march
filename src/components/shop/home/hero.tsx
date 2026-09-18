import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { homeContent } from "@/config/content";
import { images } from "@/config/images";

export function HomeHero() {
  const { hero } = homeContent;
  return (
    <section className="relative isolate -mt-px flex min-h-[88svh] items-end overflow-hidden text-white lg:min-h-[92svh]">
      <Image
        src={images[hero.image]}
        alt=""
        fill
        priority
        sizes="100vw"
        className="-z-20 object-cover object-center motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-105 motion-safe:duration-[1600ms]"
      />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/35 to-black/10" />
      <div aria-hidden className="absolute inset-y-0 left-0 -z-10 w-full bg-gradient-to-r from-black/45 to-transparent lg:w-2/3" />

      <div className="container-page pt-28 pb-10 sm:pb-14 lg:pb-16">
        <div className="max-w-3xl">
          <p className="font-display text-[11px] tracking-[0.3em] text-white/80 uppercase motion-safe:animate-fade-up sm:text-xs">
            {hero.eyebrow}
          </p>
          <h1 className="heading-display mt-5 text-4xl leading-[1.25] sm:text-5xl lg:text-6xl lg:leading-[1.2]">
            {hero.title.map((line, i) => (
              <span
                key={line}
                className="block motion-safe:animate-fade-up"
                style={{ animationDelay: `${120 + i * 140}ms` }}
              >
                {line}
              </span>
            ))}
          </h1>
          <p
            className="mt-6 max-w-xl text-sm leading-relaxed text-white/85 motion-safe:animate-fade-up sm:text-base"
            style={{ animationDelay: "420ms" }}
          >
            {hero.lead}
          </p>
          <div className="mt-8 flex flex-wrap gap-3 motion-safe:animate-fade-up" style={{ animationDelay: "540ms" }}>
            <Button asChild className="h-12 rounded-full px-7 text-[15px]">
              <Link href={hero.primaryCta.href}>
                {hero.primaryCta.label}
                <ArrowRight />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-12 rounded-full border-white/40 bg-white/10 px-7 text-[15px] text-white backdrop-blur-md hover:bg-white/20 hover:text-white dark:border-white/40 dark:bg-white/10"
            >
              <Link href={hero.secondaryCta.href}>{hero.secondaryCta.label}</Link>
            </Button>
          </div>
        </div>

        <dl
          className="mt-14 grid max-w-3xl grid-cols-3 divide-x divide-white/20 border-t border-white/20 pt-6 motion-safe:animate-fade-up"
          style={{ animationDelay: "680ms" }}
        >
          {hero.stats.map((s) => (
            <div key={s.label} className="px-3 first:pl-0 sm:px-6">
              <dt className="sr-only">{s.label}</dt>
              <dd className="font-display text-2xl font-medium tracking-tight sm:text-3xl lg:text-4xl">{s.value}</dd>
              <dd className="mt-1 text-[11px] leading-snug text-white/75 sm:text-xs">{s.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
