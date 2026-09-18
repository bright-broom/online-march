import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/common/icon";
import { PageIntro } from "@/components/shop/page-intro";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { guideContent, homeContent } from "@/config/content";
import { routes } from "@/config/nav";
import { boxSizes, carriers, shippingZones, type ShippingZoneKey } from "@/config/shipping";
import { formatNumber, formatWeight } from "@/lib/format";
import { rateFor } from "@/lib/shipping";

export const metadata: Metadata = {
  title: guideContent.title,
  description: "ご注文方法、お支払い、送料・お届け、キャンセル、ギフト対応について。",
  alternates: { canonical: routes.guide },
};

const zoneKeys = Object.keys(shippingZones) as ShippingZoneKey[];

export default function GuidePage() {
  const { howItWorks } = homeContent;
  return (
    <>
      <PageIntro crumbs={[{ label: guideContent.title }]} eyebrow="GUIDE" title={guideContent.title} lead="はじめての方へ。ご注文からお届けまでの流れと、送料・お支払いについてご案内します。" />

      <div className="container-page grid gap-12 pb-20 sm:pb-28 lg:grid-cols-[14rem_1fr] lg:gap-16">
        <nav aria-label="目次" className="hidden lg:block">
          <ul className="sticky top-24 space-y-1 border-l">
            {[{ id: "flow", title: howItWorks.title }, ...guideContent.sections, { id: "rates", title: "送料表" }].map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-muted-foreground hover:text-foreground hover:border-primary -ml-px block border-l border-transparent py-1.5 pl-4 text-sm transition-colors">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-16">
          <section id="flow" className="scroll-mt-24">
            <h2 className="heading-display text-2xl">{howItWorks.title}</h2>
            <ol className="mt-6 grid gap-3 sm:grid-cols-2">
              {howItWorks.steps.map((s, i) => (
                <li key={s.title} className="bg-paper flex gap-4 rounded-2xl p-5">
                  <span className="bg-background text-primary flex size-11 shrink-0 items-center justify-center rounded-full">
                    <Icon name={s.icon} className="size-5" />
                  </span>
                  <div>
                    <p className="font-semibold">
                      <span className="num text-primary mr-2">{i + 1}.</span>
                      {s.title}
                    </p>
                    <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {guideContent.sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24 border-t pt-10">
              <h2 className="heading-display text-2xl">{s.title}</h2>
              <p className="text-foreground/85 mt-4 max-w-prose text-[15px] leading-loose">{s.body}</p>
            </section>
          ))}

          <section id="rates" className="scroll-mt-24 border-t pt-10">
            <h2 className="heading-display text-2xl">送料表</h2>
            <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
              {carriers.yamato.label}「{carriers.yamato.service}」の場合の目安（税込・1箱あたり）です。配送会社は農家さんごとに異なり、送料無料の設定がある農家さんもあります。
            </p>
            <div className="mt-6 overflow-hidden rounded-2xl border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-paper hover:bg-paper">
                    <TableHead className="min-w-28 pl-4">地域</TableHead>
                    {boxSizes.map((b) => (
                      <TableHead key={b.size} className="text-right">
                        <span className="block">{b.size}サイズ</span>
                        <span className="text-muted-foreground block text-[10px] font-normal">〜{formatWeight(b.maxWeightGrams)}</span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {zoneKeys.map((z) => (
                    <TableRow key={z}>
                      <TableCell className="pl-4 font-medium">
                        {shippingZones[z].label}
                        <span className="text-muted-foreground block text-[10px] font-normal">お届けまで約{shippingZones[z].transitDays}日</span>
                      </TableCell>
                      {boxSizes.map((b) => (
                        <TableCell key={b.size} className="num text-right">
                          {formatNumber(rateFor("yamato", z, b.size))}円
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <div className="bg-paper flex flex-col items-start gap-4 rounded-2xl p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-serif text-lg">ほかにご不明な点はありませんか？</p>
            <Button asChild variant="outline" className="h-11 rounded-full px-6">
              <Link href={routes.faq}>
                よくある質問を見る
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
