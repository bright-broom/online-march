import { Tractor } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/common/empty-state";
import { FarmCard } from "@/components/shop/farm-card";
import { PageIntro } from "@/components/shop/page-intro";
import { homeContent } from "@/config/content";
import { routes, shopNav } from "@/config/nav";
import { listFarms } from "@/server/queries/catalog";

const navTitle = shopNav.find((n) => n.href === routes.farms)?.title ?? homeContent.farms.title;

export const metadata: Metadata = {
  title: homeContent.farms.title,
  description: homeContent.farms.lead,
  alternates: { canonical: routes.farms },
};

export default async function FarmsPage() {
  const farms = await listFarms();
  return (
    <>
      <PageIntro crumbs={[{ label: navTitle }]} eyebrow={homeContent.farms.eyebrow} title={homeContent.farms.title} lead={homeContent.farms.lead} />
      <div className="container-page pb-20 sm:pb-28">
        {farms.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {farms.map((f) => (
              <FarmCard key={f.id} farm={f} />
            ))}
          </div>
        ) : (
          <EmptyState icon={Tractor} title="生産者の準備中です" description="まもなく南あわじの農家さんが登場します。" className="border py-16" />
        )}
      </div>
    </>
  );
}
