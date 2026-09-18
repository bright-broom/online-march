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
    icons: [{ src: "/icon", sizes: "64x64", type: "image/png" }],
  };
}
