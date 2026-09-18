import type { Metadata } from "next";
import { PageHeader } from "@/components/dashboard/page-header";
import { NotificationsList } from "@/components/mypage/notifications-list";
import { routes } from "@/config/nav";
import { requireRole } from "@/server/auth/guards";
import { getRecentNotifications } from "@/server/queries/badges";

export const metadata: Metadata = { title: "お知らせ" };

export default async function NotificationsPage() {
  const user = await requireRole("customer", routes.mypage.notifications);
  const items = await getRecentNotifications(user.id, 100);
  return (
    <>
      <PageHeader title="お知らせ" description="ご注文・発送・メッセージなどのお知らせです。" />
      <NotificationsList items={items} />
    </>
  );
}
