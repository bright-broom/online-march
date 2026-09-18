import { CheckCircle2, KeyRound, TriangleAlert } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { JobCatalogEntry } from "@/server/queries/admin";
import { PanelCard } from "../primitives";

/** Vercel Cron configuration (vercel.json) + CRON_SECRET status. Never prints the secret. */
export function CronConfigCard({ jobs, cronSecretConfigured }: { jobs: JobCatalogEntry[]; cronSecretConfigured: boolean }) {
  return (
    <PanelCard title="Vercel Cron の設定" description="vercel.json の crons で /api/cron/[job] を定期実行します（スケジュールは UTC）">
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs">パス</TableHead>
                <TableHead className="text-xs">schedule (UTC)</TableHead>
                <TableHead className="text-xs">目安</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((j) => (
                <TableRow key={j.name}>
                  <TableCell><code className="text-[11px]">{j.path}</code></TableCell>
                  <TableCell>{j.cron ? <code className="bg-muted rounded px-1.5 py-0.5 text-[11px]">{j.cron}</code> : <span className="text-destructive text-xs">未登録</span>}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{j.schedule}（JST）</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="grid gap-3 text-xs sm:grid-cols-2">
          <div className="bg-muted/40 space-y-1.5 rounded-xl p-3">
            <p className="flex items-center gap-1.5 font-medium">
              <KeyRound className="size-3.5" />
              認証（CRON_SECRET）
              {cronSecretConfigured ? (
                <span className="text-leaf ml-auto inline-flex items-center gap-1"><CheckCircle2 className="size-3.5" />設定済み</span>
              ) : (
                <span className="text-destructive ml-auto inline-flex items-center gap-1"><TriangleAlert className="size-3.5" />未設定</span>
              )}
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Vercel は <code>Authorization: Bearer $CRON_SECRET</code> を付けて呼び出します。本番で未設定の場合、エンドポイントは 503 を返し実行されません。
            </p>
          </div>
          <div className="bg-muted/40 space-y-1.5 rounded-xl p-3">
            <p className="flex items-center gap-1.5 font-medium"><TriangleAlert className="size-3.5" />Hobby プランの制限</p>
            <p className="text-muted-foreground leading-relaxed">
              Hobby は Cron が1日1回まで。Pro を推奨します。Hobby の場合は未入金キャンセルを Stripe の <code>checkout.session.expired</code> Webhook を主経路にしてください。
            </p>
          </div>
        </div>
      </div>
    </PanelCard>
  );
}
