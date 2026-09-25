import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageIntro } from "@/components/shop/page-intro";
import { cancellationPolicy, guideContent, legalContent, legalDraft } from "@/config/content";
import { footerNav, routes } from "@/config/nav";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

const docs = Object.keys(routes.legal) as (keyof typeof routes.legal)[];
type Doc = (typeof docs)[number];

const isDoc = (v: string): v is Doc => (docs as string[]).includes(v);
const titleOf = (doc: Doc) =>
  footerNav.flatMap((g) => g.items).find((i) => i.href === routes.legal[doc])?.title ?? doc;
const guide = (id: string) => guideContent.sections.find((s) => s.id === id)?.body ?? "";

export function generateStaticParams() {
  return docs.map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: PageProps<"/legal/[doc]">): Promise<Metadata> {
  const { doc } = await params;
  if (!isDoc(doc)) return { title: "ページが見つかりません" };
  return { title: titleOf(doc), alternates: { canonical: routes.legal[doc] } };
}

function Tokushoho() {
  const { company, contact, name } = siteConfig;
  const rows: { th: string; td: React.ReactNode }[] = [
    { th: "販売事業者", td: company.operator },
    { th: "運営統括責任者", td: company.representative },
    { th: "所在地", td: <>〒{company.postalCode}<br />{company.address}</> },
    {
      th: "連絡先",
      td: (
        <>
          メール：<a href={`mailto:${contact.email}`} className="text-primary hover:underline">{contact.email}</a>
          <br />
          電話：{contact.phone}（{contact.hours}）
        </>
      ),
    },
    { th: "販売価格", td: "各商品ページに税込価格で表示しています。" },
    {
      th: "商品代金以外の必要料金",
      td: (
        <>
          送料（生産者ごと・お届け地域・箱のサイズにより算出。
          <Link href={`${routes.guide}#shipping`} className="text-primary hover:underline">送料について</Link>
          ）。コンビニ払いの場合の手数料はお客さま負担となる場合があります。
        </>
      ),
    },
    { th: "お支払い方法", td: guide("payment") },
    { th: "お支払い時期", td: "クレジットカード等はご注文時、コンビニ払いはご注文後の期限内にお支払いください。" },
    { th: "商品の引渡時期", td: "ご注文確定後、各生産者の出荷準備日数（通常1〜3日）以内に発送し、配送日数を経てお届けします。お届け希望日の指定も可能です。" },
    { th: "返品・交換・キャンセル", td: cancellationPolicy },
    { th: "販売について", td: `${name}は、各生産者が出品する商品の販売の場を提供するマーケットプレイスです。商品の出荷は各生産者が行います。` },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border">
      <dl className="divide-y">
        {rows.map((r) => (
          <div key={r.th} className="grid sm:grid-cols-[14rem_1fr]">
            <dt className="bg-paper px-5 py-4 text-sm font-semibold">{r.th}</dt>
            <dd className="px-5 py-4 text-sm leading-relaxed">{r.td}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default async function LegalPage({ params }: PageProps<"/legal/[doc]">) {
  const { doc } = await params;
  if (!isDoc(doc)) notFound();
  const title = titleOf(doc);

  return (
    <>
      <PageIntro crumbs={[{ label: title }]} eyebrow="LEGAL" title={title} />
      <div className="container-page grid gap-10 pb-20 sm:pb-28 lg:grid-cols-[14rem_1fr] lg:gap-16">
        <nav aria-label="規約・表記" className="order-last lg:order-first">
          <ul className="space-y-1 lg:sticky lg:top-24">
            {docs.map((d) => (
              <li key={d}>
                <Link
                  href={routes.legal[d]}
                  aria-current={d === doc ? "page" : undefined}
                  className={cn(
                    "block rounded-lg px-3 py-2 text-sm transition-colors",
                    d === doc ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {titleOf(d)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <article className="min-w-0">
          {legalDraft && (
            <p role="note" className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
              これは公開前のドラフトです。【要確認】の箇所を含め、運営開始前に内容を確定してください。
            </p>
          )}
          {doc === "tokushoho" ? (
            <Tokushoho />
          ) : (
            <div className="max-w-prose space-y-8 text-[15px] leading-loose">
              <p>{legalContent[doc].intro}</p>
              {legalContent[doc].sections.map((sec) => (
                <section key={sec.heading} className="space-y-2">
                  <h2 className="heading-display text-lg">{sec.heading}</h2>
                  {sec.body.map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </section>
              ))}
              <div className="text-muted-foreground space-y-1 border-t pt-5 text-xs">
                <p>制定・改定日：{legalContent[doc].updatedAt}</p>
                <p>
                  お問い合わせ窓口：{siteConfig.company.operator}（{siteConfig.contact.email}）
                </p>
              </div>
            </div>
          )}
        </article>
      </div>
    </>
  );
}
