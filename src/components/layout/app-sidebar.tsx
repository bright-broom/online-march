"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/common/logo";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar,
} from "@/components/ui/sidebar";
import { adminNav, farmerNav, mypageNav, type NavGroup } from "@/config/nav";
import type { BadgeCounts } from "@/server/queries/badges";
import { UserMenu, type MenuUser } from "./user-menu";

export type DashboardArea = "mypage" | "farmer" | "admin";
export const areaNav: Record<DashboardArea, NavGroup[]> = { mypage: mypageNav, farmer: farmerNav, admin: adminNav };
const areaRoot: Record<DashboardArea, string> = { mypage: "/mypage", farmer: "/farmer", admin: "/admin" };

export function AppSidebar({ area, user, context, badges }: { area: DashboardArea; user: MenuUser; context?: string; badges: BadgeCounts }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const isActive = (href: string) => (href === areaRoot[area] ? pathname === href : pathname.startsWith(href));
  return (
    <Sidebar collapsible="icon" variant="inset" className="no-print">
      <SidebarHeader className="gap-3 px-3 pt-4">
        <Logo className="group-data-[collapsible=icon]:[&>span]:hidden" />
        {context && (
          <div className="bg-sidebar-accent/60 rounded-lg px-3 py-2 text-xs group-data-[collapsible=icon]:hidden">
            <p className="text-muted-foreground">ログイン中</p>
            <p className="truncate font-medium">{context}</p>
          </div>
        )}
      </SidebarHeader>
      <SidebarContent>
        {areaNav[area].map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const count = item.badge ? badges[item.badge] : undefined;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.title}>
                        <Link href={item.href} onClick={() => setOpenMobile(false)}>
                          {item.icon && <item.icon />}
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                      {!!count && <SidebarMenuBadge className="bg-primary text-primary-foreground rounded-full px-1.5">{count}</SidebarMenuBadge>}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <UserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
