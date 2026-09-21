"use client";
import { PauseCircle } from "lucide-react";
import { formatDate } from "@/lib/format";

/** 端末のカレンダー上の日付（ページはキャッシュされるので、判定はブラウザ側で行う） */
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** 出荷をお休み中の農園のお知らせ。商品は見られるが、この期間は注文できない。 */
export function FarmPausedNotice({ farmName, pausedUntil }: { farmName: string; pausedUntil: string | null }) {
  if (!pausedUntil || pausedUntil < todayLocal()) return null;
  return (
    <div className="border-primary/30 bg-primary/5 mt-6 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm">
      <PauseCircle className="text-primary mt-0.5 size-4 shrink-0" />
      <p className="leading-relaxed">
        {farmName}は <span className="font-medium">{formatDate(pausedUntil)}</span> まで出荷をお休みしています。
        <span className="text-muted-foreground">この間はご注文いただけません。再開までお待ちください。</span>
      </p>
    </div>
  );
}
