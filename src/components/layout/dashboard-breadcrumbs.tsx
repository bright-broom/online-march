"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { areaNav, type DashboardArea } from "./app-sidebar";

const areaTitle: Record<DashboardArea, string> = { mypage: "マイページ", farmer: "生産者", admin: "運営" };
const extra: Record<string, string> = { new: "新規作成", slip: "納品書", edit: "編集", receipt: "領収書" };

/** Breadcrumbs derived from the nav config; unknown segments (ids) render as "詳細". */
export function DashboardBreadcrumbs({ area }: { area: DashboardArea }) {
  const pathname = usePathname();
  const items = areaNav[area].flatMap((g) => g.items);
  const segs = pathname.split("/").filter(Boolean);
  const crumbs = segs.map((seg, i) => {
    const href = "/" + segs.slice(0, i + 1).join("/");
    const title = i === 0 ? areaTitle[area] : items.find((n) => n.href === href)?.title ?? extra[seg] ?? "詳細";
    return { href, title };
  });
  return (
    <Breadcrumb className="hidden sm:block">
      <BreadcrumbList>
        {crumbs.map((c, i) => (
          <Fragment key={c.href}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {i === crumbs.length - 1 ? <BreadcrumbPage>{c.title}</BreadcrumbPage> : <BreadcrumbLink asChild><Link href={c.href}>{c.title}</Link></BreadcrumbLink>}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
