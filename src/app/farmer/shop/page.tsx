import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { ShopForm } from "@/components/farmer/shop/shop-form";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/nav";
import { requireFarm } from "@/server/auth/guards";

export const metadata: Metadata = { title: "ショップページ" };

export default async function FarmerShopPage() {
  const { farm } = await requireFarm();
  const isPublic = farm.status === "active";
  return (
    <div>
      <PageHeader
        title="ショップページ"
        description="お客さまが最初に見る、農園の顔になるページです。写真とストーリーで、畑の空気を伝えましょう。"
        actions={
          isPublic && (
            <Button asChild variant="outline">
              <Link href={routes.farm(farm.slug)} target="_blank"><ExternalLink />公開ページ</Link>
            </Button>
          )
        }
      />
      <ShopForm
        initial={{
          slug: farm.slug,
          name: farm.name,
          tagline: farm.tagline,
          story: farm.story,
          representative: farm.representative,
          establishedYear: farm.establishedYear,
          postalCode: farm.postalCode,
          prefecture: farm.prefecture,
          city: farm.city,
          addressLine: farm.addressLine,
          phone: farm.phone,
          heroImage: farm.heroImage,
          avatarImage: farm.avatarImage,
          gallery: farm.gallery,
          cultivationMethods: farm.cultivationMethods,
          isPublic,
        }}
      />
    </div>
  );
}
