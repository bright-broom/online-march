"use client";
import { CalendarIcon, PauseCircle, PlayCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { ja } from "react-day-picker/locale";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { addDays, toYmd } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { setFarmPause } from "@/server/actions/farmer-shop";

const toYmdLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromYmdLocal = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/**
 * 出荷できない期間の受付停止。天候・体調・出荷終了のときに、商品を1つずつ非公開にしなくて済むようにする。
 * 再開日を必ず決めてもらうので、解除し忘れて売り逃すことがない。
 */
export function PauseCard({ pausedUntil, today }: { pausedUntil: string | null; today: string }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const paused = Boolean(pausedUntil && pausedUntil >= today);
  const presets = [
    { label: "3日間", until: addDays(today, 2) },
    { label: "1週間", until: addDays(today, 6) },
    { label: "2週間", until: addDays(today, 13) },
    { label: "1か月", until: addDays(today, 29) },
  ];

  const save = (until: string | null) =>
    start(async () => {
      const res = await setFarmPause({ until });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setOpen(false);
      toast.success(until ? `${formatDate(until)}まで受付を停止しました` : "受付を再開しました");
    });

  return (
    <Card className={paused ? "border-primary/40" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PauseCircle className="size-4" />受付の一時停止（お休み）
        </CardTitle>
        <CardDescription>
          収穫の切れ目や天候・ご体調で出荷できない期間は、受付を止められます。商品は「お休み中」と表示され、
          再開日を過ぎると自動で受付が戻ります。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {paused ? (
          <>
            <Alert className="border-primary/40 bg-primary/5">
              <PauseCircle />
              <AlertTitle>{formatDate(pausedUntil!)} まで受付を停止しています</AlertTitle>
              <AlertDescription>
                翌日から自動で受付を再開します。すぐ再開する場合は下のボタンを押してください。
              </AlertDescription>
            </Alert>
            <Button onClick={() => save(null)} disabled={pending} className="rounded-full">
              {pending ? <Spinner /> : <PlayCircle />}いま受付を再開する
            </Button>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {presets.map((p) => (
              <Button key={p.label} variant="outline" className="rounded-full" disabled={pending} onClick={() => save(p.until)}>
                {p.label}
              </Button>
            ))}
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="rounded-full" disabled={pending}>
                  <CalendarIcon />日付を指定
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  locale={ja}
                  autoFocus
                  disabled={{ before: fromYmdLocal(toYmd(new Date())) }}
                  onSelect={(d) => d && save(toYmdLocal(d))}
                />
              </PopoverContent>
            </Popover>
            {pending && <Spinner />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
