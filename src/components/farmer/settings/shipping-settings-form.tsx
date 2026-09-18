"use client";
import { Minus, Plus, Truck } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { carriers, shippingPolicy, shippingZones, type ShippingZoneKey } from "@/config/shipping";
import type { Carrier } from "@/db/schema/marketplace";
import { addDays, fromYmd, toYmd, weekday } from "@/lib/dates";
import { formatDate, formatNumber } from "@/lib/format";
import { quoteShipment, scheduleDelivery } from "@/lib/shipping";
import type { ActionResult } from "@/server/actions/_utils";
import { saveShippingSettings } from "@/server/actions/farmer-shop";
import { StickySaveBar } from "../sticky-save-bar";
import { useUnsavedWarning } from "../use-unsaved-warning";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const PREVIEW_PREF = "東京都";
const SAMPLE_WEIGHTS = [5000, 10000];

type Settings = { defaultCarrier: Carrier; leadTimeDays: number; shipWeekdays: number[]; freeShippingEnabled: boolean; freeShippingThreshold: string };

export function ShippingSettingsForm({ initial, nowIso }: { initial: Settings; nowIso: string }) {
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const dirty = JSON.stringify(s) !== saved;
  useUnsavedWarning(dirty);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }));

  const [state, action, pending] = useActionState(async (prev: ActionResult | null, fd: FormData) => {
    const res = await saveShippingSettings(prev, fd);
    if (res.ok) {
      setSaved(fd.get("__snapshot") as string);
      toast.success(res.message ?? "保存しました");
    } else toast.error(res.error);
    return res;
  }, null);
  const fe = (k: string) => (state && !state.ok ? state.fieldErrors?.[k]?.[0] : undefined);

  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const preview = useMemo(() => {
    const q = quoteShipment({ prefecture: PREVIEW_PREF, carrier: s.defaultCarrier, productWeightGrams: SAMPLE_WEIGHTS[0], subtotal: 0 });
    const sched = scheduleDelivery({
      now, leadTimeDays: s.leadTimeDays, shipWeekdays: s.shipWeekdays, transitDays: q.transitDays, windowDays: shippingPolicy.desiredDateWindowDays,
    });
    return sched;
  }, [now, s.defaultCarrier, s.leadTimeDays, s.shipWeekdays]);
  const threshold = Number.parseInt(s.freeShippingThreshold.replace(/[,，]/g, ""), 10);

  const feeRows = (Object.keys(shippingZones) as ShippingZoneKey[]).map((z) => ({
    zone: z,
    label: shippingZones[z].label,
    fees: SAMPLE_WEIGHTS.map((g) => quoteShipment({ prefecture: shippingZones[z].prefectures[0], carrier: s.defaultCarrier, productWeightGrams: g, subtotal: 0 })),
  }));

  return (
    <form action={action}>
      <input type="hidden" name="__snapshot" value={JSON.stringify(s)} />
      <input type="hidden" name="defaultCarrier" value={s.defaultCarrier} />
      <input type="hidden" name="leadTimeDays" value={s.leadTimeDays} />
      <input type="hidden" name="shipWeekdays" value={JSON.stringify(s.shipWeekdays)} />
      <input type="hidden" name="freeShippingEnabled" value={String(s.freeShippingEnabled)} />
      <input type="hidden" name="freeShippingThreshold" value={s.freeShippingEnabled ? s.freeShippingThreshold.replace(/[,，]/g, "") : ""} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>いつも使う配送業者</CardTitle>
              <CardDescription>送料の計算と、出荷センターの送り状CSVの初期値に使われます。</CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup value={s.defaultCarrier} onValueChange={(v) => set("defaultCarrier", v as Carrier)} className="grid gap-2 sm:grid-cols-3">
                {(Object.keys(carriers) as Carrier[]).map((c) => (
                  <FieldLabel key={c} htmlFor={`carrier-${c}`}>
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>{carriers[c].label}</FieldTitle>
                        <FieldDescription className="text-xs">{carriers[c].service}・{carriers[c].csvLabel}</FieldDescription>
                      </FieldContent>
                      <RadioGroupItem value={c} id={`carrier-${c}`} />
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>出荷の日程</CardTitle>
              <CardDescription>ご注文から出荷までの日数と、出荷できる曜日。お客さまが選べるお届け日に反映されます。</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field data-invalid={!!fe("leadTimeDays") || undefined}>
                  <FieldLabel>出荷までの日数</FieldLabel>
                  <div className="flex items-center gap-3">
                    <Button type="button" variant="outline" size="icon" className="size-11 rounded-full" onClick={() => set("leadTimeDays", Math.max(1, s.leadTimeDays - 1))} disabled={s.leadTimeDays <= 1} aria-label="1日減らす">
                      <Minus />
                    </Button>
                    <p className="min-w-24 text-center">
                      <span className="num text-3xl font-semibold">{s.leadTimeDays}</span>
                      <span className="text-muted-foreground ml-1 text-sm">日後</span>
                    </p>
                    <Button type="button" variant="outline" size="icon" className="size-11 rounded-full" onClick={() => set("leadTimeDays", Math.min(7, s.leadTimeDays + 1))} disabled={s.leadTimeDays >= 7} aria-label="1日増やす">
                      <Plus />
                    </Button>
                  </div>
                  <FieldDescription>収穫・箱詰めに必要な日数（1〜7日）。短いほど選ばれやすくなります。</FieldDescription>
                  <FieldError>{fe("leadTimeDays")}</FieldError>
                </Field>
                <Field data-invalid={!!fe("shipWeekdays") || undefined}>
                  <FieldLabel>出荷できる曜日</FieldLabel>
                  <ToggleGroup
                    type="multiple"
                    variant="outline"
                    spacing={1}
                    value={s.shipWeekdays.map(String)}
                    onValueChange={(v) => set("shipWeekdays", v.map(Number).sort((a, b) => a - b))}
                    className="flex-wrap"
                  >
                    {WEEKDAYS.map((w, i) => (
                      <ToggleGroupItem
                        key={w}
                        value={String(i)}
                        aria-label={`${w}曜日`}
                        className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground size-11 rounded-full"
                      >
                        {w}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <FieldDescription>集荷に来てもらえる曜日を選んでください。</FieldDescription>
                  <FieldError>{fe("shipWeekdays")}</FieldError>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>送料無料ライン</CardTitle>
              <CardDescription>一定額以上のご注文で送料を無料に（送料は農園の負担になります）。</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldTitle>送料無料を設定する</FieldTitle>
                    <FieldDescription className="text-xs">まとめ買いのきっかけになります</FieldDescription>
                  </FieldContent>
                  <Switch checked={s.freeShippingEnabled} onCheckedChange={(v) => set("freeShippingEnabled", v)} aria-label="送料無料を設定する" />
                </Field>
                {s.freeShippingEnabled && (
                  <Field data-invalid={!!fe("freeShippingThreshold") || undefined}>
                    <FieldLabel htmlFor="threshold">この金額以上で送料無料</FieldLabel>
                    <InputGroup className="max-w-56">
                      <InputGroupInput id="threshold" inputMode="numeric" value={s.freeShippingThreshold} onChange={(e) => set("freeShippingThreshold", e.target.value)} placeholder="8000" aria-invalid={!!fe("freeShippingThreshold") || undefined} />
                      <InputGroupAddon align="inline-end"><InputGroupText>円以上</InputGroupText></InputGroupAddon>
                    </InputGroup>
                    <FieldError>{fe("freeShippingThreshold")}</FieldError>
                  </Field>
                )}
              </FieldGroup>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm"><Truck className="size-4" />今日注文された場合の最短お届け日（{PREVIEW_PREF}）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="heading-display text-2xl">
                {formatDate(fromYmd(preview.earliestDeliveryDate))}
                <span className="text-base">（{WEEKDAYS[weekday(preview.earliestDeliveryDate)]}）</span>
              </p>
              <p className="text-muted-foreground text-xs">
                出荷 {formatDate(fromYmd(preview.earliestShipDate))}（{WEEKDAYS[weekday(preview.earliestShipDate)]}）
                ・受付 {formatDate(fromYmd(toYmd(now)))}
              </p>
              <p className="text-muted-foreground text-xs">お客さまは {formatDate(fromYmd(addDays(preview.earliestDeliveryDate, shippingPolicy.desiredDateWindowDays)))} まで日付を指定できます。</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">送料の目安（{carriers[s.defaultCarrier].label}）</CardTitle>
              <CardDescription className="text-xs">
                商品重量で箱サイズを自動選択します
                {s.freeShippingEnabled && Number.isFinite(threshold) && `・${formatNumber(threshold)}円以上は無料`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">地域</TableHead>
                    {feeRows[0].fees.map((f, i) => (
                      <TableHead key={SAMPLE_WEIGHTS[i]} className="text-right text-xs">{SAMPLE_WEIGHTS[i] / 1000}kg<span className="text-muted-foreground block text-[10px] font-normal">{f.boxSize}サイズ</span></TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feeRows.map((r) => (
                    <TableRow key={r.zone}>
                      <TableCell className="py-2 text-xs">{r.label}</TableCell>
                      {r.fees.map((f, i) => <TableCell key={SAMPLE_WEIGHTS[i]} className="num py-2 text-right text-xs">{formatNumber(f.fee)}円</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </aside>
      </div>

      <StickySaveBar dirty={dirty} pending={pending} />
    </form>
  );
}
