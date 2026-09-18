"use client";
import { LogOut, Store, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { roleHome, routes } from "@/config/nav";
import type { UserRole } from "@/db/schema/auth";
import { signOut } from "@/lib/auth-client";

const roleLabel: Record<UserRole, string> = { customer: "マイページ", farmer: "生産者ダッシュボード", admin: "運営管理" };

export type MenuUser = { name: string; email: string; role: UserRole };

export function UserMenu({ user, compact = false }: { user: MenuUser; compact?: boolean }) {
  const router = useRouter();
  const initial = user.name.slice(0, 1);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className={compact ? "size-9 rounded-full p-0" : "h-auto w-full justify-start gap-2 px-2 py-1.5"}>
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/15 text-primary font-serif">{initial}</AvatarFallback>
          </Avatar>
          {!compact && (
            <span className="flex min-w-0 flex-col items-start text-left leading-tight">
              <span className="truncate text-sm font-medium">{user.name}</span>
              <span className="text-muted-foreground truncate text-xs">{user.email}</span>
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium">{user.name}</p>
          <p className="text-muted-foreground text-xs">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href={roleHome[user.role]}><UserRound />{roleLabel[user.role]}</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={routes.home}><Store />ストアを見る</Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await signOut();
            router.push(routes.home);
            router.refresh();
          }}
        >
          <LogOut />ログアウト
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
