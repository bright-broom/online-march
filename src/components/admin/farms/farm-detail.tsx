import { CheckCircle2, CircleDashed, Clock, JapaneseYen, Mail, PackageCheck, Phone, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { TrendChart } from "@/components/charts";
import { StatCard } from "@/components/dashboard/stat-card";
import { Price } from "@/components/common/price";
import { RatingSummary } from "@/components/common/rating";
import { StatusBadge, ToneBadge } from "@/components/common/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { categories, cultivationMethods, type CultivationKey } from "@/config/catalog";
import { bpsToPercent } from "@/config/fees";
import { routes } from "@/config/nav";
import { carriers } from "@/config/shipping";
import { formatDate, formatDateTime, formatPostalCode, formatYen } from "@/lib/format";
import type { AdminFarmDetail } from "@/server/queries/admin";
import { roleMeta, weekdayLabels } from "../labels";
import { DetailList, PanelCard } from "../primitives";
import { FarmFeaturedSwitch } from "../toggles";

type Series = { month: string; gmv: number; commission: number; orders: number }[];

export function FarmDetailView({ data, series, platformBps }: { data: AdminFarmDetail; series: Series; platformBps: number }) {
  const { farm, owner, kpis } = data;
  const rate = farm.commissionRateBps ?? platformBps;
  const trend12 = series.map((s) => s.gmv);
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="生産者KPI">
        <StatCard label="累計流通額" value={kpis.lifetimeGmv} format="yen" icon={JapaneseYen} trend={trend12} hint={`${kpis.lifetimeOrders}件`} />
        <StatCard label="直近30日の売上" value={kpis.gmv30d} format="yen" icon={ShoppingBag} hint={`${kpis.orders30d}件`} color="chart-2" />
        <StatCard label="未発送の注文" value={kpis.openOrders} icon={PackageCheck} hint="新規受注・出荷準備中" color="chart-3" />
        <StatCard
          label="期限内出荷率"
          value={kpis.onTimeRate}
          format="percent"
          icon={Clock}
          hint={kpis.onTimeRate == null ? "出荷実績なし" : "出荷期限までに発送した割合"}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <PanelCard title="月別売上" description="直近12か月（流通総額・手数料）" className="xl:col-span-2">
          <TrendChart
            data={series}
            xKey="month"
            valueFormat="yen"
            height={280}
            series={[
              { key: "gmv", label: "流通総額", color: "chart-1" },
              { key: "commission", label: "手数料", color: "chart-3" },
            ]}
          />
        </PanelCard>
        <PanelCard title="アカウント" description="出店者の連絡先">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{owner.name}</p>
                <p className="text-muted-foreground text-xs">登録 {formatDate(owner.createdAt)}</p>
              </div>
              <ToneBadge tone={roleMeta[owner.role].tone}>{roleMeta[owner.role].label}</ToneBadge>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2"><Mail className="text-muted-foreground size-4" /><a className="truncate hover:underline" href={`mailto:${owner.email}`}>{owner.email}</a></li>
              <li className="flex items-center gap-2"><Phone className="text-muted-foreground size-4" />{farm.phone || owner.phone || "—"}</li>
            </ul>
            <div className="bg-muted/50 space-y-2 rounded-xl p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">販売手数料</span>
                <span className="num font-semibold">
                  {bpsToPercent(rate)}%{farm.commissionRateBps == null && <span className="text-muted-foreground ml-1 font-normal">（標準）</span>}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">累計手数料</span>
                <span className="num font-semibold">{formatYen(kpis.lifetimeCommission)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Stripe 振込先</span>
                {farm.stripeOnboarded ? (
                  <span className="text-leaf inline-flex items-center gap-1 font-medium"><CheckCircle2 className="size-3.5" />登録済み</span>
                ) : (
                  <span className="text-muted-foreground inline-flex items-center gap-1"><CircleDashed className="size-3.5" />未登録（手動振込）</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">おすすめ表示</span>
                <FarmFeaturedSwitch farmId={farm.id} featured={farm.isFeatured} />
              </div>
            </div>
          </div>
        </PanelCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <PanelCard title="ショップ情報" className="xl:col-span-2">
          <DetailList
            rows={[
              ["ショップ名", farm.name],
              ["キャッチコピー", farm.tagline || "—"],
              ["代表者", farm.representative],
              ["所在地", `〒${formatPostalCode(farm.postalCode)} ${farm.prefecture}${farm.city}${farm.addressLine}`],
              ["設立", farm.establishedYear ? `${farm.establishedYear}年` : "—"],
              [
                "栽培方法",
                farm.cultivationMethods.length
                  ? farm.cultivationMethods.map((m) => cultivationMethods[m as CultivationKey]?.label ?? m).join("・")
                  : "—",
              ],
              ["配送業者", `${carriers[farm.defaultCarrier].label}（${carriers[farm.defaultCarrier].service}）`],
              ["出荷", `受注から${farm.leadTimeDays}日以内・出荷曜日 ${farm.shipWeekdays.map((d) => weekdayLabels[d]).join("")}`],
              ["送料無料", farm.freeShippingThreshold ? `${formatYen(farm.freeShippingThreshold)}以上` : "設定なし"],
              ["紹介文", <p key="story" className="text-muted-foreground line-clamp-4 text-xs leading-relaxed">{farm.story || "—"}</p>],
            ]}
          />
        </PanelCard>
        <PanelCard title="履歴" description="主要な日時と識別子">
          <DetailList
            className="grid-cols-[6rem_1fr]"
            rows={[
              ["申請日時", formatDateTime(farm.createdAt)],
              ["承認日時", farm.approvedAt ? formatDateTime(farm.approvedAt) : "未承認"],
              ["最終更新", formatDateTime(farm.updatedAt)],
              ["状態", <StatusBadge key="s" kind="farm" status={farm.status} />],
              ["スラッグ", <code key="slug" className="bg-muted rounded px-1.5 py-0.5 text-xs">{farm.slug}</code>],
              ["Stripe", farm.stripeAccountId ? "Connect アカウント作成済み" : "未作成"],
              ["評価", <RatingSummary key="r" sum={farm.ratingSum} count={farm.ratingCount} />],
            ]}
          />
        </PanelCard>
      </div>

      <PanelCard title="商品" description={`${data.products.length}件`} contentClassName="px-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4 text-xs">商品名</TableHead>
              <TableHead className="text-xs">カテゴリ</TableHead>
              <TableHead className="text-xs">価格</TableHead>
              <TableHead className="text-xs">在庫</TableHead>
              <TableHead className="text-xs">販売数</TableHead>
              <TableHead className="text-xs">評価</TableHead>
              <TableHead className="pr-4 text-xs">状態</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.products.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-muted-foreground h-20 text-center">商品はまだありません</TableCell></TableRow>
            )}
            {data.products.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="max-w-64 truncate pl-4">
                  <Link href={routes.product(p.slug)} target="_blank" className="font-medium hover:underline">{p.name}</Link>
                </TableCell>
                <TableCell className="text-xs">{categories[p.category].label}</TableCell>
                <TableCell className="num text-xs whitespace-nowrap">
                  {Number.isFinite(p.minPrice) ? (p.minPrice === p.maxPrice ? formatYen(p.minPrice) : `${formatYen(p.minPrice)}〜${formatYen(p.maxPrice)}`) : "—"}
                </TableCell>
                <TableCell className="num">{p.stock}</TableCell>
                <TableCell className="num">{p.soldCount}</TableCell>
                <TableCell><RatingSummary sum={p.ratingSum} count={p.ratingCount} /></TableCell>
                <TableCell className="pr-4"><StatusBadge kind="product" status={p.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </PanelCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <PanelCard title="最近の受注" contentClassName="px-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4 text-xs">受注番号</TableHead>
                <TableHead className="text-xs">お客さま</TableHead>
                <TableHead className="text-xs">出荷期限</TableHead>
                <TableHead className="text-right text-xs">商品代金</TableHead>
                <TableHead className="pr-4 text-xs">状態</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentOrders.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-muted-foreground h-20 text-center">受注はまだありません</TableCell></TableRow>
              )}
              {data.recentOrders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="pl-4"><Link href={routes.admin.order(o.orderId)} className="num text-xs font-medium hover:underline">{o.code}</Link></TableCell>
                  <TableCell className="max-w-32 truncate text-xs">{o.customer}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{formatDate(o.shipByDate)}</TableCell>
                  <TableCell className="text-right"><Price amount={o.subtotal} size="sm" showTax={false} /></TableCell>
                  <TableCell className="pr-4"><StatusBadge kind="farmOrder" status={o.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PanelCard>
        <PanelCard title="精算履歴" contentClassName="px-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4 text-xs">対象期間</TableHead>
                <TableHead className="text-xs">件数</TableHead>
                <TableHead className="text-right text-xs">手数料</TableHead>
                <TableHead className="text-right text-xs">振込額</TableHead>
                <TableHead className="pr-4 text-xs">状態</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.payouts.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-muted-foreground h-20 text-center">精算はまだありません</TableCell></TableRow>
              )}
              {data.payouts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="pl-4 text-xs whitespace-nowrap">{formatDate(p.periodStart)}〜{formatDate(p.periodEnd)}</TableCell>
                  <TableCell className="num text-xs">{p.orderCount}</TableCell>
                  <TableCell className="num text-right text-xs">{formatYen(p.commission)}</TableCell>
                  <TableCell className="text-right"><Price amount={p.amount} size="sm" showTax={false} /></TableCell>
                  <TableCell className="pr-4"><StatusBadge kind="payout" status={p.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PanelCard>
      </div>
    </div>
  );
}
