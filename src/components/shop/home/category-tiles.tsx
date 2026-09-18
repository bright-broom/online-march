import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { SectionHeading } from "@/components/common/section-heading";
import { categories, categoryKeys } from "@/config/catalog";
import { homeContent } from "@/config/content";
import { images } from "@/config/images";
import { routes } from "@/config/nav";
import { cn } from "@/lib/utils";

/** Bento-style category tiles: first tile spans two rows on desktop. */
export function HomeCategoryTiles() {
  const { seasonal } = homeContent;
  return (
    <section className="container-page py-16 sm:py-24">
      <SectionHeading eyebrow={seasonal.eyebrow} title={seasonal.title} lead={seasonal.lead} />
      <ul className="mt-10 grid auto-rows-[11rem] grid-cols-2 gap-3 sm:auto-rows-[13rem] sm:gap-4 lg:grid-cols-4">
        {categoryKeys.map((key, i) => {
          const c = categories[key];
          return (
            <li key={key} className={cn(i === 0 && "col-span-2 row-span-2 lg:col-span-2")}>
              <Link
                href={`${routes.products}?category=${key}`}
                className="group relative flex size-full flex-col justify-end overflow-hidden rounded-2xl p-4 text-white sm:p-5"
              >
                <Image
                  src={images[c.image]}
                  alt=""
                  fill
                  sizes={i === 0 ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 25vw, 50vw"}
                  className="-z-10 object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                />
                <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <span className="flex items-end justify-between gap-3">
                  <span className="space-y-1">
                    <span className={cn("block font-serif font-semibold", i === 0 ? "text-2xl sm:text-3xl" : "text-base sm:text-lg")}>{c.label}</span>
                    <span className={cn("text-xs leading-relaxed text-white/80", i === 0 ? "block max-w-sm sm:text-sm" : "line-clamp-2 max-sm:hidden")}>
                      {c.description}
                    </span>
                  </span>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 backdrop-blur-md transition-colors group-hover:bg-white group-hover:text-black">
                    <ArrowUpRight className="size-4" />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
