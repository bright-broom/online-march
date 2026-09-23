import type { MetadataRoute } from "next";
import { routes } from "@/config/nav";
import { features, siteUrl } from "@/lib/env";

/**
 * 公開準備が終わるまでは検索避け。デモデータ・仮の特商法表記のまま拾われると、
 * 実在の店として検索結果に出てしまう。デモモードを切り、本番キーを入れた時点で自動的に公開される
 * （/admin/settings の「本番公開チェック」にも同じ状態が出る）。
 */
const readyForSearch = !features.demo && /^sk_live_|^rk_live_/.test(process.env.STRIPE_SECRET_KEY ?? "");

export default function robots(): MetadataRoute.Robots {
  if (!readyForSearch) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
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
