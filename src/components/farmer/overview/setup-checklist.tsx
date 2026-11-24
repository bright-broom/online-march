import { Check } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { farmSetupCopy, type FarmSetupStep } from "@/config/farm-setup";
import { routes } from "@/config/nav";
import { cn } from "@/lib/utils";
import type { FarmSetup } from "@/server/queries/farmer";

const hrefs: Record<FarmSetupStep, string> = {
  product: routes.farmer.newProduct,
  payout: routes.farmer.payouts,
  shop: routes.farmer.shop,
};

/** 承認直後の農園に、販売を始めるのに足りないものを示す。全部そろったら出さない。 */
export function SetupChecklist({ setup }: { setup: FarmSetup }) {
  const steps = Object.keys(farmSetupCopy.steps) as FarmSetupStep[];
  if (steps.every((k) => setup[k])) return null;
  return (
    <section aria-label={farmSetupCopy.title} className="bg-card rounded-xl border p-5">
      <h2 className="font-semibold">{farmSetupCopy.title}</h2>
      <p className="text-muted-foreground mt-1 text-sm">{farmSetupCopy.description}</p>
      <ul className="mt-4 divide-y">
        {steps.map((k) => {
          const step = farmSetupCopy.steps[k];
          const done = setup[k];
          return (
            <li key={k} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                    done && "bg-leaf border-leaf text-primary-foreground",
                  )}
                >
                  {done && <Check className="size-3.5" />}
                </span>
                <div>
                  <p className={cn("text-sm font-medium", done && "text-muted-foreground line-through")}>
                    {step.label}
                    {done && <span className="sr-only">（{farmSetupCopy.done}）</span>}
                  </p>
                  {!done && <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{step.hint}</p>}
                </div>
              </div>
              {!done && (
                <Button asChild size="sm" variant="outline" className="shrink-0 self-start sm:self-center">
                  <Link href={hrefs[k]}>{step.cta}</Link>
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
