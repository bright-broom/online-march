import type { Metadata } from "next";
import { roleMeta } from "@/components/admin/labels";
import { FilterTabs } from "@/components/admin/primitives";
import { ServerSearch } from "@/components/admin/server-search";
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
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) || undefined : undefined;
  const { rows, counts } = await getAdminUsers(q);
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
        <ServerSearch action={routes.admin.users} q={q} placeholder="名前・メール・農園名で全件から探す" keep={{ role }} />
        {q && <p className="text-muted-foreground text-xs">「{q}」の検索結果: {rows.length}件</p>}
        <UsersTable rows={filtered} currentUserId={me.id} />
        {!q && rows.length >= 500 && <p className="text-muted-foreground text-xs">新しい順に500件を表示しています。それより前の会員は上の検索で探せます。</p>}
      </div>
    </>
  );
}
