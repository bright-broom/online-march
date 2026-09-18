"use client";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel";
import { images as stock } from "@/config/images";
import { cn } from "@/lib/utils";

/** Swipeable gallery + thumbnail rail. First image is the LCP element (priority). */
export function ProductGallery({ images, name }: { images: { url: string; alt: string }[]; name: string }) {
  const list = images.length ? images : [{ url: stock.onionGolden, alt: name }];
  const [api, setApi] = useState<CarouselApi>();
  const [index, setIndex] = useState(0);

  const onSelect = useCallback((a: NonNullable<CarouselApi>) => setIndex(a.selectedScrollSnap()), []);
  useEffect(() => {
    if (!api) return;
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api, onSelect]);

  return (
    <div className="space-y-3 lg:sticky lg:top-24">
      <Carousel setApi={setApi} opts={{ loop: list.length > 1 }} className="group/gallery" aria-label={`${name}の写真`}>
        <CarouselContent className="-ml-0">
          {list.map((img, i) => (
            <CarouselItem key={img.url + i} className="pl-0">
              <div className="bg-muted relative aspect-[4/5] overflow-hidden rounded-3xl">
                <Image
                  src={img.url}
                  alt={img.alt || name}
                  fill
                  priority={i === 0}
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        {list.length > 1 && (
          <>
            <CarouselPrevious className="bg-background/85 left-3 size-10 border-0 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover/gallery:opacity-100 focus-visible:opacity-100 max-md:hidden" />
            <CarouselNext className="bg-background/85 right-3 size-10 border-0 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover/gallery:opacity-100 focus-visible:opacity-100 max-md:hidden" />
            <div className="bg-background/80 num absolute right-3 bottom-3 rounded-full px-2.5 py-1 text-[11px] backdrop-blur md:hidden">
              {index + 1} / {list.length}
            </div>
          </>
        )}
      </Carousel>

      {list.length > 1 && (
        <ul className="scrollbar-none flex gap-2 overflow-x-auto" aria-label="写真を選ぶ">
          {list.map((img, i) => (
            <li key={img.url + i} className="shrink-0">
              <button
                type="button"
                onClick={() => api?.scrollTo(i)}
                aria-label={`${i + 1}枚目の写真を表示`}
                aria-current={i === index}
                className={cn(
                  "focus-visible:ring-ring/50 relative block size-16 overflow-hidden rounded-xl ring-offset-2 ring-offset-background transition-all outline-none focus-visible:ring-3 sm:size-20",
                  i === index ? "ring-primary ring-2" : "opacity-70 hover:opacity-100",
                )}
              >
                <Image src={img.url} alt="" fill sizes="80px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
