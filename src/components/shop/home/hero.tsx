import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { homeContent } from "@/config/content";
import { images } from "@/config/images";

export function HomeHero() {
  const { hero } = homeContent;
  return (
    <section className="relative isolate -mt-px flex min-h-[80svh] items-end overflow-hidden text-white lg:min-h-[86svh]">
      <Image src={images[hero.image]} alt="" fill priority sizes="100vw" className="-z-20 object-cover object-[68%_50%]" />
      {/* 文字を読めるようにするための暗幕（飾りではない） */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/30 to-black/5" />

      <div className="container-page pt-28 pb-12 sm:pb-16">
        <div className="max-w-3xl motion-safe:animate-fade-up">
          <p className="text-sm text-white/85">{hero.origin}</p>
          <h1 className="heading-display mt-3 text-[1.9rem] leading-[1.35] sm:text-5xl lg:text-6xl lg:leading-[1.25]">
            {hero.title.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </h1>
          <p className="mt-6 max-w-xl text-sm leading-relaxed text-white/90 sm:text-base">{hero.lead}</p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Button asChild className="h-12 rounded-full px-7 text-[15px]">
              <Link href={hero.primaryCta.href}>{hero.primaryCta.label}</Link>
            </Button>
            <Link href={hero.secondaryCta.href} className="text-[15px] underline decoration-white/50 underline-offset-[6px] hover:decoration-white">
              {hero.secondaryCta.label}
            </Link>
          </div>
          <p className="mt-10 text-xs leading-relaxed text-white/75 sm:text-sm">{hero.note}</p>
        </div>
      </div>
    </section>
  );
}
