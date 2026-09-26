"use client";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useState } from "react";
import { Price } from "@/components/common/price";
import { ToneBadge } from "@/components/common/status-badge";
import { DataTable } from "@/components/dashboard/data-table";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { userModerationCopy } from "@/config/content";
import { routes } from "@/config/nav";
import type { UserRole } from "@/db/schema/auth";
import { formatDate } from "@/lib/format";
import { setUserRole } from "@/server/actions/admin-users";
import type { AdminUserRow } from "@/server/queries/admin";
import { roleMeta } from "../labels";
import { UserModeration } from "./user-moderation";
import { useRunAction } from "../use-admin-action";

const roles = Object.keys(roleMeta) as UserRole[];

function RoleSelect({ user, isSelf }: { user: AdminUserRow; isSelf: boolean }) {
  const [pendingRole, setPendingRole] = useState<UserRole | null>(null);
  const [pending, run] = useRunAction();
  return (
    <>
      <Select value={user.role} onValueChange={(v) => v !== user.role && setPendingRole(v as UserRole)} disabled={isSelf}>
        <SelectTrigger size="sm" className="w-28" aria-label={`${user.name} のロール`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {roles.map((r) => (
            <SelectItem key={r} value={r}>{roleMeta[r].label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <AlertDialog open={pendingRole !== null} onOpenChange={(o) => !o && !pending && setPendingRole(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ロールを変更しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {user.name}（{user.email}）を「{roleMeta[user.role].label}」から「{pendingRole ? roleMeta[pendingRole].label : ""}」に変更します。
              {pendingRole === "admin" && " 運営権限ではすべての注文・個人情報・設定にアクセスできます。"}
              {pendingRole === "farmer" && !user.farmId && " この方にはまだショップがありません。出店申請の承認を通すことをおすすめします。"}
              {" "}反映まで最大5分かかる場合があります。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>キャンセル</AlertDialogCancel>
            <Button
              variant={pendingRole === "admin" || user.role === "admin" ? "destructive" : "default"}
              disabled={pending}
              onClick={() => pendingRole && run(() => setUserRole({ userId: user.id, role: pendingRole }), { onSuccess: () => setPendingRole(null) })}
            >
              {pending && <Spinner />}
              変更する
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function UsersTable({ rows, currentUserId }: { rows: AdminUserRow[]; currentUserId: string }) {
  const columns: ColumnDef<AdminUserRow>[] = [
    {
      id: "name",
      accessorFn: (u) => `${u.name} ${u.email}`,
      header: "ユーザー",
      cell: ({ row: { original: u } }) => (
        <div className="max-w-64 min-w-44">
          <p className="truncate font-medium">
            {u.name}
            {u.id === currentUserId && <span className="text-muted-foreground ml-1.5 text-xs">（あなた）</span>}
          </p>
          <p className="text-muted-foreground truncate text-xs">{u.email}</p>
          {u.deletedAt ? (
            <ToneBadge tone="neutral" className="mt-1">{userModerationCopy.anonymizedBadge}</ToneBadge>
          ) : u.suspendedAt ? (
            <span title={u.suspendedReason || undefined}>
              <ToneBadge tone="danger" className="mt-1">{userModerationCopy.suspendedBadge}（{formatDate(u.suspendedAt)}〜）</ToneBadge>
            </span>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "role",
      header: "ロール",
      cell: ({ row: { original: u } }) => <ToneBadge tone={roleMeta[u.role].tone}>{roleMeta[u.role].label}</ToneBadge>,
    },
    {
      id: "farm",
      accessorFn: (u) => u.farmName ?? "",
      header: "ショップ",
      cell: ({ row: { original: u } }) =>
        u.farmId ? (
          <Link href={routes.admin.farm(u.farmId)} className="text-xs hover:underline">{u.farmName}</Link>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
    { accessorKey: "orders", header: "注文数", cell: ({ getValue }) => <span className="num">{Number(getValue())}</span> },
    { accessorKey: "spend", header: "購入金額", cell: ({ getValue }) => <Price amount={Number(getValue())} size="sm" showTax={false} /> },
    {
      id: "createdAt",
      accessorFn: (u) => u.createdAt.valueOf(),
      header: "登録日",
      cell: ({ row: { original: u } }) => <span className="text-xs whitespace-nowrap">{formatDate(u.createdAt)}</span>,
    },
    {
      id: "change",
      header: "ロール変更",
      enableSorting: false,
      cell: ({ row: { original: u } }) => <RoleSelect user={u} isSelf={u.id === currentUserId} />,
    },
    {
      id: "moderation",
      header: "利用停止・匿名化",
      enableSorting: false,
      cell: ({ row: { original: u } }) => <UserModeration user={u} isSelf={u.id === currentUserId} />,
    },
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      pageSize={25}
      searchPlaceholder="名前・メール・ショップ名で検索"
      emptyText="該当するユーザーはいません"
    />
  );
}
