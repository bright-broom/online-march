import {
  BellRing,
  CalendarClock,
  ChevronRight,
  CreditCard,
  FileSpreadsheet,
  MailCheck,
  MessageSquareHeart,
  PackageCheck,
  ScanBarcode,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { feeConfig } from "@/config/fees";
import { carriers, shippingPolicy } from "@/config/shipping";
import type { Tone } from "@/config/status";
import { ToneBadge } from "@/components/common/status-badge";
import { cn } from "@/lib/utils";

type Actor = "auto" | "farmer" | "cron";
const actorMeta: Record<Actor, { label: string; tone: Tone }> = {
  auto: { label: "自動", tone: "success" },
  farmer: { label: "生産者", tone: "brand" },
  cron: { label: "Cron", tone: "info" },
};

const steps: { icon: LucideIcon; title: string; detail: string; actor: Actor }[] = [
  { icon: CreditCard, title: "決済完了", detail: `Stripe Webhook / デモ決済で確定（${shippingPolicy.pendingPaymentTtlMinutes}分で未入金キャンセル）`, actor: "auto" },
  { icon: BellRing, title: "受注通知", detail: "生産者へメールとアプリ通知", actor: "auto" },
  { icon: CalendarClock, title: "出荷期限算出", detail: "リードタイム・出荷曜日から自動設定、前日にリマインド", actor: "auto" },
  { icon: FileSpreadsheet, title: "送り状CSV", detail: `${Object.values(carriers).map((c) => c.csvLabel).join("・")} 形式で出力`, actor: "farmer" },
  { icon: ScanBarcode, title: "追跡番号登録", detail: "入力または追跡CSVの一括取込", actor: "farmer" },
  { icon: MailCheck, title: "発送メール", detail: "追跡リンク付きでお客さまへ", actor: "auto" },
  { icon: PackageCheck, title: "配達確認", detail: `定期的に同期、未対応キャリアは発送${shippingPolicy.autoDeliveredAfterDays}日後に完了`, actor: "cron" },
  { icon: MessageSquareHeart, title: "レビュー依頼", detail: `配達${shippingPolicy.reviewRequestAfterDays}日後にお願いメール`, actor: "cron" },
  { icon: Wallet, title: "月次精算", detail: `月末締め、翌月${feeConfig.payout.payoutDay}日に送金`, actor: "cron" },
];

/** Order → shipping → payout automation pipeline (docs/SHIPPING.md §3–4). */
export function AutomationPipeline() {
  return (
    <ol className="-mx-1 flex snap-x gap-1 overflow-x-auto px-1 pb-2 2xl:grid 2xl:grid-cols-9 2xl:overflow-visible">
      {steps.map((s, i) => (
        <li key={s.title} className="flex shrink-0 snap-start items-stretch 2xl:shrink">
          <div
            className={cn(
              "bg-card relative flex w-40 flex-col gap-2 rounded-xl border p-3 2xl:w-auto",
              s.actor === "farmer" && "bg-gold-soft/30",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="bg-primary/10 text-primary grid size-8 place-items-center rounded-lg">
                <s.icon className="size-4" />
              </span>
              <span className="num text-muted-foreground text-[10px]">{String(i + 1).padStart(2, "0")}</span>
            </div>
            <p className="text-sm font-medium">{s.title}</p>
            <p className="text-muted-foreground text-[11px] leading-relaxed">{s.detail}</p>
            <ToneBadge tone={actorMeta[s.actor].tone} className="mt-auto w-fit text-[10px]">{actorMeta[s.actor].label}</ToneBadge>
          </div>
          {i < steps.length - 1 && <ChevronRight className="text-muted-foreground/60 my-auto size-4 shrink-0 2xl:hidden" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}
