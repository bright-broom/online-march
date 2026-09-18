import { Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/shop/json-ld";
import { PageIntro } from "@/components/shop/page-intro";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { faqContent, guideContent } from "@/config/content";
import { routes } from "@/config/nav";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "よくある質問",
  description: "お届け日数、送料、保存方法、傷みがあった場合の対応など、よくいただくご質問にお答えします。",
  alternates: { canonical: routes.faq },
};

export default function FaqPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqContent.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        }}
      />
      <PageIntro crumbs={[{ label: "よくある質問" }]} eyebrow="FAQ" title="よくある質問" lead="お問い合わせの前に、こちらもご覧ください。" />
      <div className="container-page grid gap-12 pb-20 sm:pb-28 lg:grid-cols-[1fr_20rem] lg:gap-16">
        <Accordion type="single" collapsible defaultValue="faq-0" className="border-t">
          {faqContent.map((f, i) => (
            <AccordionItem key={f.q} value={`faq-${i}`} className="border-b">
              <AccordionTrigger className="py-5 text-left font-serif text-base font-semibold hover:no-underline sm:text-lg">
                <span className="flex gap-3">
                  <span className="font-display text-primary">Q.</span>
                  {f.q}
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-foreground/85 pb-6 pl-7 text-[15px] leading-loose">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <aside className="bg-paper h-fit space-y-4 rounded-2xl p-6 lg:sticky lg:top-24">
          <p className="font-serif text-lg font-semibold">解決しない場合は</p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            ご注文に関するご質問は、マイページのメッセージから農家さんへ直接お問い合わせいただけます。サービス全般については運営までご連絡ください。
          </p>
          <p className="text-sm">
            <a href={`mailto:${siteConfig.contact.email}`} className="text-primary inline-flex items-center gap-1.5 hover:underline">
              <Mail className="size-4" />
              {siteConfig.contact.email}
            </a>
            <span className="text-muted-foreground mt-1 block text-xs">{siteConfig.contact.hours}</span>
          </p>
          <Button asChild variant="outline" className="h-10 w-full rounded-full">
            <Link href={routes.guide}>{guideContent.title}を見る</Link>
          </Button>
        </aside>
      </div>
    </>
  );
}
