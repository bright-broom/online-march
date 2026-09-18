"use client";
import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Screen-only toolbar for the 納品書 page. `autoPrint` opens the print dialog once on load. */
export function PrintToolbar({ count, backHref, autoPrint }: { count: number; backHref: string; autoPrint?: boolean }) {
  useEffect(() => {
    if (!autoPrint) return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [autoPrint]);
  return (
    <div className="no-print mx-auto mb-6 flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
      <Button asChild variant="ghost" size="sm">
        <Link href={backHref}><ArrowLeft />戻る</Link>
      </Button>
      <p className="text-muted-foreground text-sm">{count}件の納品書（A4・1件1ページ）</p>
      <Button onClick={() => window.print()} className="rounded-full">
        <Printer />印刷する
      </Button>
    </div>
  );
}
