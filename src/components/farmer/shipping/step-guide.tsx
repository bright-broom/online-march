import { CheckCircle2, ClipboardCheck, MailCheck, Printer, ScanBarcode } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepCounts = { toPrepare: number; toLabel: number; toTrack: number };

/** ① 準備 ② 送り状 ③ 追跡番号 ④ 自動で発送メール */
export function StepGuide({ counts }: { counts: StepCounts }) {
  const steps = [
    { icon: ClipboardCheck, title: "準備", body: "新規受注を「出荷準備中」に", count: counts.toPrepare, unit: "件が未着手" },
    { icon: Printer, title: "送り状", body: "CSVを配送ソフトに取り込んで印刷", count: counts.toLabel, unit: "件が未出力" },
    { icon: ScanBarcode, title: "追跡番号", body: "1件ずつ入力、またはCSVで一括登録", count: counts.toTrack, unit: "件が登録待ち" },
    { icon: MailCheck, title: "自動で発送メール", body: "追跡リンク付きメールをお客さまへ", count: null, unit: "" },
  ];
  return (
    <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {steps.map((s, i) => {
        const done = s.count === 0;
        return (
          <li key={s.title} className={cn("bg-card relative flex gap-3 rounded-xl border p-3", s.count && s.count > 0 && "border-primary/40 bg-primary/5")}>
            <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold", done ? "bg-leaf/15 text-leaf" : "bg-primary/10 text-primary")}>
              {done ? <CheckCircle2 className="size-4" /> : <span className="num">{i + 1}</span>}
            </span>
            <div className="min-w-0 space-y-0.5">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <s.icon className="text-muted-foreground size-3.5" />
                {s.title}
              </p>
              <p className="text-muted-foreground text-[11px] leading-snug">{s.body}</p>
              {s.count != null && s.count > 0 && <p className="text-primary text-[11px] font-semibold"><span className="num">{s.count}</span>{s.unit}</p>}
              {s.count == null && <p className="text-leaf text-[11px] font-medium">おまかせでOK</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
