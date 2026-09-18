import { Badge } from "@/components/ui/badge";
import {
  farmOrderStatusMeta,
  farmStatusMeta,
  orderStatusMeta,
  payoutStatusMeta,
  productStatusMeta,
  toneClasses,
  type Tone,
} from "@/config/status";
import { cn } from "@/lib/utils";

const registry = {
  order: orderStatusMeta,
  farmOrder: farmOrderStatusMeta,
  product: productStatusMeta,
  farm: farmStatusMeta,
  payout: payoutStatusMeta,
} as const;

type Kind = keyof typeof registry;
type StatusOf<K extends Kind> = keyof (typeof registry)[K];

/** The only way to render a status label. Labels & tones come from config/status.ts. */
export function StatusBadge<K extends Kind>({ kind, status, className }: { kind: K; status: StatusOf<K>; className?: string }) {
  const meta = (registry[kind] as Record<string, { label: string; tone: Tone }>)[status as string];
  if (!meta) return null;
  return (
    <Badge variant="outline" className={cn("rounded-full font-medium", toneClasses[meta.tone], className)}>
      {meta.label}
    </Badge>
  );
}

export function ToneBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <Badge variant="outline" className={cn("rounded-full font-medium", toneClasses[tone], className)}>
      {children}
    </Badge>
  );
}
