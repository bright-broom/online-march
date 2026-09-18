import { Megaphone, Wrench } from "lucide-react";
import { getPlatformSettings } from "@/server/queries/settings";
import { getShopAnnouncements } from "@/server/queries/catalog";

/** Thin bar above the header with the latest shopper announcement (cached → part of the static shell). */
export async function ShopAnnouncementBar() {
  const [[latest], settings] = await Promise.all([getShopAnnouncements(1), getPlatformSettings()]);
  if (settings.maintenanceMode) {
    return (
      <div role="status" className="bg-destructive text-white">
        <div className="container-page flex min-h-9 items-center justify-center gap-2 py-1.5 text-center text-xs font-medium">
          <Wrench className="size-3.5 shrink-0" aria-hidden />
          ただいまメンテナンス中です。商品はご覧いただけますが、ご注文の受付を一時停止しています。
        </div>
      </div>
    );
  }
  if (!latest) return null;
  return (
    <div className="bg-sea text-sea-foreground">
      <div className="container-page flex min-h-9 items-center justify-center gap-2 py-1.5 text-center text-xs">
        <Megaphone className="size-3.5 shrink-0 opacity-80" aria-hidden />
        <p className="line-clamp-1">
          <span className="font-medium">{latest.title}</span>
          {latest.body && <span className="hidden opacity-75 md:inline"> — {latest.body}</span>}
        </p>
      </div>
    </div>
  );
}
