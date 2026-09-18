import { ArrowRight, Heart, Megaphone, MessageCircle, Package, Sprout, Wallet } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { Price } from "@/components/common/price";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { ActiveShipmentCard } from "@/components/mypage/active-shipment-card";
import { OrderCard } from "@/components/mypage/order-card";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { routes } from "@/config/nav";
import { formatDate } from "@/lib/format";
import { requireRole } from "@/server/auth/guards";
import {
  getCustomerAnnouncements,
  getMypageStats,
  listActiveShipments,
  listFollowedFarmProducts,
  listOrders,
} from "@/server/queries/account";

export default async function MypageHomePage() {
  const user = await requireRole("customer", routes.mypage.root);
  const [stats, shipments, recent, newProducts, news] = await Promise.all([
    getMypageStats(user.id),
    listActiveShipments(user.id),
    listOrders(user.id, 3),
    listFollowedFarmProducts(user.id, 6),
    getCustomerAnnouncements(3),
  ]);

  return (
    <>
      <PageHeader
        title={`${user.name}さん、こんにちは`}
        description="ご注文の状況や、フォロー中の生産者さんの新着をまとめています。"
        actions={
          <Button asChild className="rounded-full">
            <Link href={routes.products}>玉ねぎをさがす<ArrowRight /></Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="ご注文数" value={stats.orderCount} icon={Package} hint="お支払い済み" />
        <StatCard label="累計ご購入額" value={stats.totalSpent} format="yen" icon={Wallet} />
        <StatCard label="お気に入り" value={stats.favoriteCount} icon={Heart} />
        <StatCard label="未読メッセージ" value={stats.unreadMessages} icon={MessageCircle} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>配送中のご注文</CardTitle>
            <CardDescription>生産者ごとに発送されます</CardDescription>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href={routes.mypage.orders}>注文履歴<ArrowRight /></Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-3">
            {shipments.length ? (
              shipments.map((s) => <ActiveShipmentCard key={s.id} shipment={s} />)
            ) : (
              <EmptyState icon={Package} title="配送中のご注文はありません" description="新しいご注文が発送されると、ここで状況を確認できます。" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Megaphone className="text-primary size-4" />お知らせ</CardTitle>
          </CardHeader>
          <CardContent>
            {news.length ? (
              <ul className="divide-y">
                {news.map((n) => (
                  <li key={n.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                    <p className="text-muted-foreground num text-[11px]">{formatDate(n.publishedAt)}</p>
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.body && <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">{n.body}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">現在お知らせはありません。</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>最近のご注文</CardTitle>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href={routes.mypage.orders}>すべて見る<ArrowRight /></Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-3">
            {recent.length ? (
              recent.map((o) => <OrderCard key={o.id} order={o} />)
            ) : (
              <EmptyState icon={Package} title="まだご注文はありません" description="南あわじの農家さんから、旬の玉ねぎを取り寄せてみませんか。">
                <Button asChild variant="outline" className="rounded-full">
                  <Link href={routes.products}>商品をさがす</Link>
                </Button>
              </EmptyState>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>フォロー中の生産者の新着</CardTitle>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href={routes.mypage.favorites}>フォロー一覧<ArrowRight /></Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {newProducts.length ? (
              <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3">
                {newProducts.map((p) => (
                  <li key={p.id}>
                    <Link href={routes.product(p.slug)} className="group block space-y-2">
                      <div className="bg-muted relative aspect-square overflow-hidden rounded-xl">
                        {p.imageUrl && (
                          <Image
                            src={p.imageUrl}
                            alt={p.name}
                            fill
                            sizes="(min-width: 1280px) 12vw, (min-width: 640px) 30vw, 45vw"
                            className="object-cover transition-transform duration-700 motion-safe:group-hover:scale-[1.03]"
                          />
                        )}
                      </div>
                      <p className="text-muted-foreground truncate text-[11px]">{p.farmName}</p>
                      <p className="line-clamp-2 text-xs font-medium">{p.name}</p>
                      {p.price > 0 && <Price amount={p.price} size="sm" showTax={false} />}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={Sprout} title="フォロー中の生産者はいません" description="気になる農家さんをフォローすると、新商品がここに届きます。">
                <Button asChild variant="outline" className="rounded-full">
                  <Link href={routes.farms}>生産者を見る</Link>
                </Button>
              </EmptyState>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
