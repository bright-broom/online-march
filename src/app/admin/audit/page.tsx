import type { Metadata } from "next";
import { AuditTable } from "@/components/admin/audit/audit-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { routes } from "@/config/nav";
import { requireRole } from "@/server/auth/guards";
import { getAuditLogs } from "@/server/queries/admin";

export const metadata: Metadata = { title: "操作記録" };

export default async function AdminAuditPage() {
  await requireRole("admin", routes.admin.audit);
  const logs = await getAuditLogs();
  return (
    <>
      <PageHeader
        title="操作記録"
        description="返金・手数料率・振込・ロールの変更など、運営が行った操作を誰がいつ行ったかを残しています（新しい順・最新1000件）。記録は消せません。"
      />
      <AuditTable rows={logs.map((l) => ({ id: l.id, createdAt: l.createdAt, actorEmail: l.actorEmail, action: l.action, summary: l.summary }))} />
    </>
  );
}
