import { Icon } from "@/components/common/icon";
import { homeContent } from "@/config/content";

export function HomeValues() {
  const { values } = homeContent;
  return (
    <section className="bg-grain border-b">
      <div className="container-page py-16 sm:py-24">
        <h2 className="heading-display text-center text-2xl sm:text-3xl">{values.title}</h2>
        <ul className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {values.items.map((v, i) => (
            <li key={v.title} className="group flex flex-col items-start gap-4 motion-safe:animate-fade-up" style={{ animationDelay: `${i * 90}ms` }}>
              <span className="bg-background text-primary ring-border group-hover:bg-primary group-hover:text-primary-foreground flex size-12 items-center justify-center rounded-2xl ring-1 transition-colors duration-500">
                <Icon name={v.icon} className="size-5" />
              </span>
              <div className="space-y-2">
                <p className="font-display text-muted-foreground text-xs tracking-[0.2em]">0{i + 1}</p>
                <h3 className="font-serif text-lg font-semibold">{v.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{v.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
