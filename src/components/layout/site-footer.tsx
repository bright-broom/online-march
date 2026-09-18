import { ArrowUpRight, Clock, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/common/logo";
import { footerNav, routes } from "@/config/nav";
import { siteConfig } from "@/config/site";
import { ShopCopyrightYear } from "./shop-copyright-year";

const socialLabels: Record<keyof typeof siteConfig.social, string> = { instagram: "Instagram", x: "X", line: "LINE" };

export function SiteFooter() {
  return (
    <footer className="bg-sea text-sea-foreground relative overflow-hidden">
      {/* soft onion-skin glow */}
      <div aria-hidden className="bg-primary/25 pointer-events-none absolute -top-40 -right-32 size-[28rem] rounded-full blur-3xl" />
      <div className="container-page relative py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_2fr]">
          <div className="space-y-6">
            <Link href={routes.home} className="inline-flex items-center gap-3" aria-label={siteConfig.name}>
              <LogoMark className="size-10" />
              <span className="flex flex-col leading-none">
                <span className="font-serif text-lg font-semibold tracking-[0.06em]">{siteConfig.name}</span>
                <span className="font-display mt-1.5 text-[10px] tracking-[0.32em] opacity-70">{siteConfig.shortName}</span>
              </span>
            </Link>
            <p className="max-w-sm font-serif text-lg leading-relaxed">{siteConfig.tagline}</p>
            <ul className="space-y-2 text-sm opacity-85">
              <li className="flex items-center gap-2">
                <Mail className="size-4 opacity-70" />
                <a href={`mailto:${siteConfig.contact.email}`} className="hover:underline">
                  {siteConfig.contact.email}
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="size-4 opacity-70" />
                <a href={`tel:${siteConfig.contact.phone}`} className="num hover:underline">
                  {siteConfig.contact.phone}
                </a>
              </li>
              <li className="flex items-start gap-2">
                <Clock className="mt-1 size-4 shrink-0 opacity-70" />
                <span className="text-xs leading-relaxed">{siteConfig.contact.hours}</span>
              </li>
            </ul>
            <ul className="flex flex-wrap gap-2">
              {(Object.keys(siteConfig.social) as (keyof typeof siteConfig.social)[]).map((k) => (
                <li key={k}>
                  <a
                    href={siteConfig.social[k]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-sea-foreground/25 hover:bg-sea-foreground/10 inline-flex h-9 items-center gap-1 rounded-full border px-3.5 text-xs transition-colors"
                  >
                    {socialLabels[k]}
                    <ArrowUpRight className="size-3 opacity-70" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <nav aria-label="フッターメニュー" className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
            {footerNav.map((group) => (
              <div key={group.title} className="space-y-4">
                <p className="text-sm font-semibold">{group.title}</p>
                <ul className="space-y-2.5">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className="text-sea-foreground/75 hover:text-sea-foreground text-[13px] transition-colors">
                        {item.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="border-sea-foreground/15 mt-16 flex flex-col gap-3 border-t pt-6 text-xs opacity-75 sm:flex-row sm:items-center sm:justify-between">
          <p>{siteConfig.region}の玉ねぎ農家と、全国の食卓をつなぐ産直マルシェ</p>
          <p className="font-display tracking-wider">
            © <ShopCopyrightYear /> {siteConfig.nameEn}
          </p>
        </div>
      </div>
    </footer>
  );
}
