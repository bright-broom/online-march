import Link from "next/link";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

/** Brand mark: stylized onion (layered arcs) + wordmark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8", className)}>
      <path d="M16 3c1.2 2.6 1.1 4.3 0 6" stroke="var(--leaf)" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M16 9C9 9.5 5 14.5 5 19.5 5 25 10 29 16 29s11-4 11-9.5C27 14.5 23 9.5 16 9Z" fill="var(--primary)" />
      <path d="M16 9c-3.5 2.2-5.5 6.2-5.5 10.5S12.5 27.2 16 29M16 9c3.5 2.2 5.5 6.2 5.5 10.5S19.5 27.2 16 29" stroke="var(--primary-foreground)" strokeOpacity=".55" strokeWidth="1.3" fill="none" />
    </svg>
  );
}

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2.5", className)} aria-label={siteConfig.name}>
      <LogoMark className="transition-transform duration-500 group-hover:-rotate-6" />
      <span className="flex flex-col leading-none">
        <span className="font-serif text-[15px] font-semibold tracking-[0.06em]">{siteConfig.name}</span>
        <span className="font-display text-muted-foreground mt-1 text-[9px] tracking-[0.32em]">{siteConfig.shortName}</span>
      </span>
    </Link>
  );
}
