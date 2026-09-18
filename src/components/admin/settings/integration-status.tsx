import { CheckCircle2, CircleDashed, TriangleAlert, type LucideIcon } from "lucide-react";
import { ToneBadge } from "@/components/common/status-badge";
import type { Tone } from "@/config/status";

export type IntegrationState = "configured" | "demo" | "warning";

export type Integration = {
  name: string;
  icon: LucideIcon;
  state: IntegrationState;
  summary: string;
  detail: string;
  /** env var names only — values are never rendered */
  envVars: string[];
};

const stateMeta: Record<IntegrationState, { label: string; tone: Tone; icon: LucideIcon }> = {
  configured: { label: "接続済み", tone: "success", icon: CheckCircle2 },
  demo: { label: "デモモード", tone: "neutral", icon: CircleDashed },
  warning: { label: "要確認", tone: "warning", icon: TriangleAlert },
};

/** Configured vs demo per external service. Shows env var *names* only — never secret values. */
export function IntegrationStatus({ items }: { items: Integration[] }) {
  return (
    <ul className="divide-y">
      {items.map((it) => {
        const m = stateMeta[it.state];
        return (
          <li key={it.name} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
              <it.icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{it.name}</p>
                <ToneBadge tone={m.tone} className="gap-1"><m.icon className="size-3" />{m.label}</ToneBadge>
              </div>
              <p className="text-sm">{it.summary}</p>
              <p className="text-muted-foreground text-xs leading-relaxed">{it.detail}</p>
              <div className="flex flex-wrap gap-1 pt-0.5">
                {it.envVars.map((v) => (
                  <code key={v} className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px]">{v}</code>
                ))}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
