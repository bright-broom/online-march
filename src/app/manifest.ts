import type { MetadataRoute } from "next";
import { routes } from "@/config/nav";
import { siteConfig } from "@/config/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: siteConfig.shortName,
    description: siteConfig.description,
    lang: "ja",
    start_url: routes.home,
    scope: "/",
    display: "standalone",
    background_color: siteConfig.themeColor.light,
    theme_color: siteConfig.themeColor.light,
    categories: ["food", "shopping"],
    // Android の「ホーム画面に追加」・インストールには 192px と 512px が要る（#21）。地を全面に塗っているので maskable としても使える
    icons: [
      { src: "/icon", sizes: "64x64", type: "image/png" },
      { src: routes.pwaIcon(192), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: routes.pwaIcon(512), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: routes.pwaIcon(512), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
