import type { MetadataRoute } from "next";
import { routes } from "@/config/nav";
import { siteUrl } from "@/lib/env";
import { getPublicFarmSlugs, getPublicProductSlugs } from "@/server/queries/catalog";

const abs = (path: string) => new URL(path, siteUrl).toString();

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, farms] = await Promise.all([getPublicProductSlugs(), getPublicFarmSlugs()]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: abs(routes.home), changeFrequency: "daily", priority: 1 },
    { url: abs(routes.products), changeFrequency: "daily", priority: 0.9 },
    { url: abs(routes.farms), changeFrequency: "weekly", priority: 0.8 },
    { url: abs(routes.about), changeFrequency: "monthly", priority: 0.6 },
    { url: abs(routes.guide), changeFrequency: "monthly", priority: 0.5 },
    { url: abs(routes.faq), changeFrequency: "monthly", priority: 0.5 },
    { url: abs(routes.join), changeFrequency: "monthly", priority: 0.5 },
    ...Object.values(routes.legal).map((href) => ({ url: abs(href), changeFrequency: "yearly" as const, priority: 0.2 })),
  ];

  return [
    ...staticPages,
    ...products.map((p) => ({
      url: abs(routes.product(p.slug)),
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...farms.map((f) => ({
      url: abs(routes.farm(f.slug)),
      lastModified: f.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
