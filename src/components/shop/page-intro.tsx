import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { routes } from "@/config/nav";
import { cn } from "@/lib/utils";
import { JsonLd } from "./json-ld";
import { absUrl } from "./seo";

export type Crumb = { label: string; href?: string };

/** Breadcrumbs with BreadcrumbList JSON-LD. "ホーム" is prepended automatically. */
export function ShopBreadcrumbs({ items, className, inverted = false }: { items: Crumb[]; className?: string; inverted?: boolean }) {
  const all: Crumb[] = [{ label: "ホーム", href: routes.home }, ...items];
  return (
    <>
      <Breadcrumb className={className}>
        <BreadcrumbList className={cn("text-xs", inverted && "text-white/75")}>
          {all.map((c, i) => (
            <Fragment key={`${c.label}-${i}`}>
              {i > 0 && <BreadcrumbSeparator className={cn(inverted && "text-white/50")} />}
              <BreadcrumbItem className="min-w-0">
                {c.href && i < all.length - 1 ? (
                  <BreadcrumbLink asChild className={cn(inverted && "hover:text-white")}>
                    <Link href={c.href}>{c.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className={cn("truncate", inverted && "text-white")}>{c.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: all.map((c, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: c.label,
            ...(c.href ? { item: absUrl(c.href) } : {}),
          })),
        }}
      />
    </>
  );
}

/** Editorial page header: breadcrumbs + eyebrow + mincho title + lead. */
export function PageIntro({
  crumbs,
  eyebrow,
  title,
  lead,
  children,
  className,
}: {
  crumbs: Crumb[];
  eyebrow?: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("container-page pt-8 pb-10 sm:pt-10 sm:pb-12", className)}>
      <ShopBreadcrumbs items={crumbs} />
      <div className="mt-8 max-w-3xl space-y-3 motion-safe:animate-fade-up">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="heading-display text-3xl sm:text-4xl lg:text-5xl">{title}</h1>
        {lead && <p className="text-muted-foreground max-w-prose text-sm leading-relaxed sm:text-base">{lead}</p>}
      </div>
      {children}
    </header>
  );
}

/** Full-bleed image hero for editorial pages (about / join). */
export function ImageHero({
  image,
  crumbs,
  eyebrow,
  title,
  lead,
  children,
}: {
  image: string;
  crumbs: Crumb[];
  eyebrow?: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative isolate flex min-h-[60svh] items-end overflow-hidden text-white">
      <Image src={image} alt="" fill priority sizes="100vw" className="-z-20 object-cover" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/30 to-black/20" />
      <div className="container-page w-full pt-10 pb-12 sm:pb-16">
        <ShopBreadcrumbs items={crumbs} inverted />
        <div className="mt-16 max-w-2xl space-y-4 motion-safe:animate-fade-up">
          {eyebrow && <p className="font-display text-xs tracking-[0.3em] text-white/80 uppercase">{eyebrow}</p>}
          <h1 className="heading-display text-4xl leading-tight sm:text-5xl">{title}</h1>
          {lead && <p className="max-w-xl text-sm leading-relaxed text-white/85 sm:text-base">{lead}</p>}
          {children}
        </div>
      </div>
    </section>
  );
}
