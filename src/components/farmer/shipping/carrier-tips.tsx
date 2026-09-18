import { Lightbulb } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { carriers } from "@/config/shipping";
import type { Carrier } from "@/db/schema/marketplace";

/** Per-carrier how-to for importing the label CSV and exporting tracking numbers. */
const tips: Record<Carrier, string[]> = {
  yamato: [
    "B2クラウドにログインし「送り状発行」→「外部データから発行」を開きます。",
    "初回だけ取込パターンを登録します（このCSVは1行目が見出しです）。次回からは選ぶだけで取り込めます。",
    "印刷後「発行済データ」→「CSV出力」で追跡番号入りのファイルを保存し、ここの「追跡番号を一括登録」に読み込ませると一括で発送済みになります。",
  ],
  japanpost: [
    "ゆうプリRの「宛先・ご依頼主」→「外部ファイル取込」でCSVを選びます（Shift_JISのまま取り込めます）。",
    "初回は取込レイアウトを登録してください。お客様側管理番号に注文番号が入ります。",
    "発行後は「発送済み一覧」をCSV出力し、「追跡番号を一括登録」に読み込ませます。",
  ],
  sagawa: [
    "e飛伝Ⅲの「出荷データ取込」からCSVを取り込みます。",
    "初回は取込パターン（お客様管理番号＝注文番号）を設定してください。",
    "印刷済みデータをCSV出力し、「追跡番号を一括登録」に読み込ませると発送メールまで自動です。",
  ],
};

export function CarrierTips({ defaultCarrier }: { defaultCarrier: Carrier }) {
  return (
    <Accordion type="single" collapsible defaultValue={defaultCarrier} className="bg-card rounded-xl border px-4">
      {(Object.keys(carriers) as Carrier[]).map((c) => (
        <AccordionItem key={c} value={c}>
          <AccordionTrigger className="text-sm">
            <span className="flex items-center gap-2">
              <Lightbulb className="text-primary size-4" />
              {carriers[c].label}（{carriers[c].csvLabel}）の使い方
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <ol className="text-muted-foreground list-decimal space-y-1.5 pl-5 text-xs leading-relaxed">
              {tips[c].map((t) => <li key={t}>{t}</li>)}
            </ol>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
