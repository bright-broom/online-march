import type { Metadata } from "next";
import { connection } from "next/server";
import { AnnouncementsManager, type AnnouncementRow } from "@/components/admin/content/announcements-manager";
import { PageHeader } from "@/components/dashboard/page-header";
import { routes } from "@/config/nav";
import { toYmd } from "@/lib/dates";
import { requireRole } from "@/server/auth/guards";
import { getAdminAnnouncements } from "@/server/queries/admin";

export const metadata: Metadata = { title: "お知らせ" };

const hmFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** Date → datetime-local value in JST ("2026-09-19T10:00"). */
const toJstLocalInput = (d: Date) => `${toYmd(d)}T${hmFmt.format(d)}`;

export default async function AdminAnnouncementsPage() {
  await requireRole("admin", routes.admin.announcements);
  await connection();
  const now = new Date();
  const items = await getAdminAnnouncements();
  const rows: AnnouncementRow[] = items.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    audience: a.audience,
    isPublished: a.isPublished,
    publishedAt: a.publishedAt,
    publishedAtLocal: toJstLocalInput(a.publishedAt),
    scheduled: a.publishedAt > now,
  }));
  const live = rows.filter((r) => r.isPublished && !r.scheduled).length;

  return (
    <>
      <PageHeader
        title="お知らせ"
        description={`公開中 ${live}件。購入者・生産者それぞれのマイページとストアに表示されるお知らせを管理します。`}
      />
      <AnnouncementsManager rows={rows} nowLocal={toJstLocalInput(now)} />
    </>
  );
}
