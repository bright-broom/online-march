"use client";
import { Ban, CheckCircle2, ExternalLink, Eye, MoreHorizontal, Percent, PlayCircle, Star, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { routes } from "@/config/nav";
import type { FarmStatus } from "@/db/schema/marketplace";
import { setFarmFeatured } from "@/server/actions/admin-farms";
import { useRunAction } from "../use-admin-action";
import { CommissionDialog, FarmStatusDialog, type FarmStatusIntent } from "./farm-dialogs";

export type FarmActionTarget = {
  id: string;
  name: string;
  slug: string;
  status: FarmStatus;
  isFeatured: boolean;
  commissionRateBps: number | null;
};

/** Row menu (table) — status transitions, commission override, featured toggle. */
export function FarmRowActions({ farm, platformBps, showDetailLink = true }: { farm: FarmActionTarget; platformBps: number; showDetailLink?: boolean }) {
  const [intent, setIntent] = useState<FarmStatusIntent | null>(null);
  const [commissionOpen, setCommissionOpen] = useState(false);
  const [, run] = useRunAction();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`${farm.name} の操作`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="truncate text-xs">{farm.name}</DropdownMenuLabel>
          {showDetailLink && (
            <DropdownMenuItem asChild>
              <Link href={routes.admin.farm(farm.id)}><Eye />詳細を見る</Link>
            </DropdownMenuItem>
          )}
          {farm.status === "active" && (
            <DropdownMenuItem asChild>
              <Link href={routes.farm(farm.slug)} target="_blank"><ExternalLink />ストアで見る</Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {farm.status === "pending" && (
            <>
              <DropdownMenuItem onSelect={() => setIntent("approve")}><CheckCircle2 />承認する</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setIntent("reject")}><XCircle />却下する</DropdownMenuItem>
            </>
          )}
          {farm.status === "active" && (
            <DropdownMenuItem variant="destructive" onSelect={() => setIntent("suspend")}><Ban />停止する</DropdownMenuItem>
          )}
          {farm.status === "suspended" && (
            <DropdownMenuItem onSelect={() => setIntent("resume")}><PlayCircle />再開する</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCommissionOpen(true)}><Percent />手数料率を変更</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => run(() => setFarmFeatured({ farmId: farm.id, featured: !farm.isFeatured }))}>
            <Star />
            {farm.isFeatured ? "おすすめを解除" : "おすすめに設定"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FarmStatusDialog farm={farm} intent={intent} onOpenChange={(o) => !o && setIntent(null)} />
      <CommissionDialog farm={farm} platformBps={platformBps} open={commissionOpen} onOpenChange={setCommissionOpen} />
    </>
  );
}

/** Prominent buttons for the farm detail header. */
export function FarmHeaderActions({ farm, platformBps }: { farm: FarmActionTarget; platformBps: number }) {
  const [intent, setIntent] = useState<FarmStatusIntent | null>(null);
  const [commissionOpen, setCommissionOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setCommissionOpen(true)}><Percent />手数料率</Button>
      {farm.status === "active" && (
        <Button asChild variant="outline" size="sm">
          <Link href={routes.farm(farm.slug)} target="_blank"><ExternalLink />ストアで見る</Link>
        </Button>
      )}
      {farm.status === "pending" && (
        <>
          <Button variant="destructive" size="sm" onClick={() => setIntent("reject")}><XCircle />却下</Button>
          <Button size="sm" onClick={() => setIntent("approve")}><CheckCircle2 />承認する</Button>
        </>
      )}
      {farm.status === "active" && <Button variant="destructive" size="sm" onClick={() => setIntent("suspend")}><Ban />停止</Button>}
      {farm.status === "suspended" && <Button size="sm" onClick={() => setIntent("resume")}><PlayCircle />再開する</Button>}
      <FarmStatusDialog farm={farm} intent={intent} onOpenChange={(o) => !o && setIntent(null)} />
      <CommissionDialog farm={farm} platformBps={platformBps} open={commissionOpen} onOpenChange={setCommissionOpen} />
    </>
  );
}
