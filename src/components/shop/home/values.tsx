import { homeContent } from "@/config/content";

/** 番号やアイコンの箱は付けず、見出しと説明の2段だけで並べる（docs/DESIGN.md §8） */
export function HomeValues() {
  const { values } = homeContent;
  return (
    <section className="border-b">
      <div className="container-page py-14 sm:py-20">
        <h2 className="heading-display text-2xl sm:text-3xl">{values.title}</h2>
        <dl className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {values.items.map((v) => (
            <div key={v.title} className="border-t pt-4">
              <dt className="font-semibold">{v.title}</dt>
              <dd className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{v.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
