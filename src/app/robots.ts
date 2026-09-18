import type { MetadataRoute } from "next";
import { routes } from "@/config/nav";
import { siteUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [routes.mypage.root, routes.farmer.root, routes.admin.root, "/api", routes.checkout, routes.cart],
      },
    ],
    sitemap: new URL("/sitemap.xml", siteUrl).toString(),
    host: siteUrl,
  };
}
