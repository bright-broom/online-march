import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/page-header";
import { FavoritesGrid } from "@/components/mypage/favorites-grid";
import { FollowedFarms } from "@/components/mypage/followed-farms";
import { routes } from "@/config/nav";
import { requireRole } from "@/server/auth/guards";
import { listFavoriteProducts, listFollowedFarms } from "@/server/queries/account";

export const metadata: Metadata = { title: "お気に入り" };

export default async function FavoritesPage() {
  const user = await requireRole("customer", routes.mypage.favorites);
  const [products, farms] = await Promise.all([listFavoriteProducts(user.id), listFollowedFarms(user.id)]);
  return (
    <>
      <PageHeader title="お気に入り" description="保存した商品と、フォロー中の生産者です。" />
      <section className="space-y-4">
        <h2 className="heading-display text-lg">
          お気に入りの商品 <span className="text-muted-foreground num ml-1 text-sm font-normal">{products.length}</span>
        </h2>
        <FavoritesGrid products={products} />
      </section>
      <section className="mt-12 space-y-4">
        <h2 className="heading-display text-lg">
          フォロー中の生産者 <span className="text-muted-foreground num ml-1 text-sm font-normal">{farms.length}</span>
        </h2>
        <FollowedFarms farms={farms} />
      </section>
    </>
  );
}
