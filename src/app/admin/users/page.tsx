import type { Metadata } from "next";
import { roleMeta } from "@/components/admin/labels";
import { FilterTabs } from "@/components/admin/primitives";
import { UsersTable } from "@/components/admin/users/users-table";
import { PageHeader } from "@/components/dashboard/page-header";
import { routes } from "@/config/nav";
import type { UserRole } from "@/db/schema/auth";
import { requireRole } from "@/server/auth/guards";
import { getAdminUsers } from "@/server/queries/admin";

export const metadata: Metadata = { title: "ユーザー" };

const roles = Object.keys(roleMeta) as UserRole[];

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const me = await requireRole("admin", routes.admin.users);
  const sp = await searchParams;
  const role = roles.find((r) => r === sp.role);
  const { rows, counts } = await getAdminUsers();
  const filtered = role ? rows.filter((r) => r.role === role) : rows;

  return (
    <>
      <PageHeader title="ユーザー" description="会員の一覧とロール管理。自分自身の運営権限は解除できません。" />
      <div className="space-y-4">
        <FilterTabs
          basePath={routes.admin.users}
          param="role"
          current={role ?? "all"}
          items={[
            { value: "all", label: "すべて", count: rows.length },
            ...roles.map((r) => ({ value: r, label: roleMeta[r].label, count: counts[r] ?? 0 })),
          ]}
        />
        <UsersTable rows={filtered} currentUserId={me.id} />
      </div>
    </>
  );
}
