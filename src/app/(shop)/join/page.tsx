import { ArrowDown } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Icon } from "@/components/common/icon";
import { SectionHeading } from "@/components/common/section-heading";
import { JoinGate, JoinGateSkeleton } from "@/components/shop/join/join-gate";
import { ImageHero } from "@/components/shop/page-intro";
import { Button } from "@/components/ui/button";
import { joinContent } from "@/config/content";
import { bpsToPercent, feeConfig } from "@/config/fees";
import { images } from "@/config/images";
import { footerNav, routes } from "@/config/nav";
import { cn } from "@/lib/utils";

const joinTitle = footerNav.flatMap((g) => g.items).find((i) => i.href === routes.join)?.title ?? "出店のご案内";

export const metadata: Metadata = {
  title: joinTitle,
  description: joinContent.hero.lead,
  alternates: { canonical: routes.join },
  openGraph: { images: [{ url: images[joinContent.hero.image] }] },
};

export default function JoinPage() {
  const { hero, benefits, steps } = joinContent;
  return (
    <>
      <ImageHero image={images[hero.image]} crumbs={[{ label: joinTitle }]} eyebrow={hero.eyebrow} title={hero.title} lead={hero.lead}>
        <Button asChild className="mt-4 h-12 rounded-full px-7">
          <a href="#apply">
            出店を申し込む
            <ArrowDown />
          </a>
        </Button>
      </ImageHero>

      <section className="container-page py-16 sm:py-24">
        <SectionHeading eyebrow="BENEFITS" title="はじめやすく、続けやすく" align="center" />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((b) => (
            <li key={b.title} className="bg-card flex gap-4 rounded-2xl border p-6">
              <span className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
                <Icon name={b.icon} className="size-5" />
              </span>
              <div>
                <h3 className="font-serif text-base font-semibold">{b.title}</h3>
                <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{b.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-paper">
        <div className="container-page grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-2 lg:gap-16">
          <div className="space-y-4">
            <p className="eyebrow">FEES</p>
            <h2 className="heading-display text-2xl sm:text-3xl">手数料は、売れたときの{bpsToPercent(feeConfig.defaultCommissionRateBps)}%だけ</h2>
            <p className="text-muted-foreground max-w-prose text-sm leading-relaxed sm:text-base">
              初期費用・月額費用・掲載料はかかりません。送料には手数料をかけず、売上は月末締め・翌月{feeConfig.payout.payoutDay}日にお振り込みします。
            </p>
          </div>
          <ul className="space-y-3">
            {feeConfig.comparison.map((c) => (
              <li
                key={c.name}
                className={cn(
                  "flex items-center justify-between gap-4 rounded-2xl border px-5 py-4",
                  c.highlight ? "border-primary bg-background ring-primary shadow-sm ring-1" : "bg-background/60",
                )}
              >
                <span className={cn("text-sm", c.highlight ? "font-serif text-base font-semibold" : "text-muted-foreground")}>{c.name}</span>
                <span className={cn("font-display", c.highlight ? "text-primary text-3xl font-medium" : "text-muted-foreground text-lg")}>{c.rate}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="container-page py-16 sm:py-24">
        <SectionHeading eyebrow="STEPS" title="出店までの流れ" align="center" />
        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s} className="relative rounded-2xl border p-6">
              <span className="font-display text-primary text-4xl font-light">{String(i + 1).padStart(2, "0")}</span>
              <p className="mt-3 font-medium">{s}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="apply" className="scroll-mt-20 border-t">
        <div className="container-page grid gap-10 py-16 sm:py-24 lg:grid-cols-[18rem_1fr] lg:gap-16">
          <div className="space-y-3">
            <p className="eyebrow">APPLY</p>
            <h2 className="heading-display text-2xl sm:text-3xl">出店申請フォーム</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              入力は5分ほどで完了します。商品の登録は、審査完了後にダッシュボードから行えます。
            </p>
          </div>
          <Suspense fallback={<JoinGateSkeleton />}>
            <JoinGate />
          </Suspense>
        </div>
      </section>
    </>
  );
}
