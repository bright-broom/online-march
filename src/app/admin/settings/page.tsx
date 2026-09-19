import { BookOpen, CalendarClock, CreditCard, Database, ExternalLink, ImageUp, Mail, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { PanelCard } from "@/components/admin/primitives";
import { IntegrationStatus, type Integration } from "@/components/admin/settings/integration-status";
import { CommissionRateForm, MaintenanceToggle } from "@/components/admin/settings/settings-forms";
import { ToneBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { feeConfig } from "@/config/fees";
import { routes } from "@/config/nav";
import { env, features, siteUrl } from "@/lib/env";
import { formatYen } from "@/lib/format";
import { requireRole } from "@/server/auth/guards";
import { getAdminFarms } from "@/server/queries/admin";
import { readSettingsUncached } from "@/server/queries/settings";

export const metadata: Metadata = { title: "プラットフォーム設定" };

const DEFAULT_AUTH_SECRET = "dev-secret-change-me-in-production-please";

const docs = [
  { path: "docs/DEPLOY.md", title: "デプロイと環境変数" },
  { path: "docs/PAYMENTS.md", title: "決済・手数料・精算" },
  { path: "docs/SHIPPING.md", title: "送料と出荷自動化・Cron" },
  { path: "docs/DATA_MODEL.md", title: "データモデルと状態遷移" },
  { path: "docs/ARCHITECTURE.md", title: "全体構成" },
];
const external = [
  { href: "https://dashboard.stripe.com/", title: "Stripe ダッシュボード" },
  { href: "https://resend.com/domains", title: "Resend（送信ドメイン）" },
  { href: "https://vercel.com/docs/cron-jobs", title: "Vercel Cron Jobs" },
  { href: "https://vercel.com/docs/storage/vercel-blob", title: "Vercel Blob" },
];

export default async function AdminSettingsPage() {
  await requireRole("admin", routes.admin.settings);
  await connection();
  const [settings, farms] = await Promise.all([readSettingsUncached(), getAdminFarms(new Date())]);
  const overrides = farms.filter((f) => f.commissionRateBps != null).length;
  const prod = env.NODE_ENV === "production";

  // Presence checks only — never pass secret values to the UI.
  const integrations: Integration[] = [
    {
      name: "Stripe（決済・Connect）",
      icon: CreditCard,
      state: features.stripe ? (env.STRIPE_WEBHOOK_SECRET && env.STRIPE_CONNECT_WEBHOOK_SECRET ? "configured" : "warning") : "demo",
      summary: features.stripe
        ? !env.STRIPE_WEBHOOK_SECRET
          ? "Webhook シークレットが未設定です"
          : !env.STRIPE_CONNECT_WEBHOOK_SECRET
            ? "Connect 用 Webhook シークレットが未設定です（農家の振込先登録が反映されません）"
            : "Checkout・Connect の Webhook が有効です"
        : "デモ決済で動作中（注文確定で即支払い済み）",
      detail: "Webhook: /api/webhooks/stripe（自分のアカウント: checkout.session.* ／ 連結アカウント: account.updated）",
      envVars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET"],
    },
    {
      name: "Resend（メール）",
      icon: Mail,
      state: features.email ? "configured" : "demo",
      summary: features.email ? `送信元: ${env.EMAIL_FROM}` : "メールは送信されずサーバーログに出力されます",
      detail: "注文確認・受注通知・発送・レビュー依頼・出店承認・精算のメール",
      envVars: ["RESEND_API_KEY", "EMAIL_FROM"],
    },
    {
      name: "Vercel Blob（画像）",
      icon: ImageUp,
      state: features.blob ? "configured" : "demo",
      summary: features.blob ? "アップロード画像を Blob に保存します" : "ローカル（public/uploads）に保存します",
      detail: "商品・ショップ画像のアップロード（/api/upload）",
      envVars: ["BLOB_READ_WRITE_TOKEN"],
    },
    {
      name: "Vercel Cron",
      icon: CalendarClock,
      state: env.CRON_SECRET ? "configured" : prod ? "warning" : "demo",
      summary: env.CRON_SECRET ? "CRON_SECRET で認証しています" : prod ? "本番で CRON_SECRET が未設定のため Cron は実行されません" : "未設定（ローカルでは認証なしで実行可能）",
      detail: "vercel.json の crons → /api/cron/[job]。手動実行は「配送自動化」から",
      envVars: ["CRON_SECRET"],
    },
    {
      name: "データベース",
      icon: Database,
      state: env.DATABASE_URL ? "configured" : prod ? "warning" : "demo",
      summary: env.DATABASE_URL ? "Postgres（Neon サーバーレス）" : "PGlite（埋め込み Postgres・ローカル用）",
      detail: env.DATABASE_URL ? "接続先 URL は表示しません" : `データ保存先: ${env.PGLITE_DIR}`,
      envVars: ["DATABASE_URL"],
    },
    {
      name: "認証（Better Auth）",
      icon: ShieldCheck,
      state: env.BETTER_AUTH_SECRET === DEFAULT_AUTH_SECRET ? (prod ? "warning" : "demo") : "configured",
      summary: env.BETTER_AUTH_SECRET === DEFAULT_AUTH_SECRET ? "開発用の既定シークレットを使用中です" : "独自のシークレットが設定されています",
      detail: `サイトURL: ${siteUrl}${features.demo ? "・ログイン画面にデモアカウントを表示中" : ""}`,
      envVars: ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "NEXT_PUBLIC_SITE_URL", "DEMO_MODE"],
    },
  ];

  return (
    <>
      <PageHeader title="プラットフォーム設定" description="手数料率・メンテナンスモードなど運営全体の設定と、外部サービスの接続状況。" />
      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          <PanelCard
            title="販売手数料"
            description="個別設定のない生産者に適用される標準の販売手数料"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href={routes.admin.farms}>個別設定 {overrides}件</Link>
              </Button>
            }
          >
            <CommissionRateForm currentBps={settings.commissionRateBps} defaultBps={feeConfig.defaultCommissionRateBps} />
          </PanelCard>
          <PanelCard
            title="ストアの状態"
            action={settings.maintenanceMode ? <ToneBadge tone="warning">メンテナンス中</ToneBadge> : <ToneBadge tone="success">営業中</ToneBadge>}
          >
            <MaintenanceToggle enabled={settings.maintenanceMode} />
          </PanelCard>
          <PanelCard title="精算ルール" description="src/config/fees.ts で管理（コード変更が必要）">
            <ul className="text-muted-foreground grid gap-2 text-sm sm:grid-cols-2">
              <li>締め日：<span className="text-foreground">月末</span></li>
              <li>振込日：<span className="text-foreground">翌月{feeConfig.payout.payoutDay}日</span></li>
              <li>最低振込額：<span className="text-foreground num">{formatYen(feeConfig.payout.minimumAmount)}</span></li>
              <li>送料への手数料：<span className="text-foreground">{feeConfig.commissionOnShipping ? "あり" : "なし"}</span></li>
            </ul>
          </PanelCard>
        </div>
        <div className="space-y-6 xl:col-span-2">
          <PanelCard title="外部サービスの接続状況" description="キー未設定のサービスはデモモードで動作します。値は表示しません。">
            <IntegrationStatus items={integrations} />
          </PanelCard>
          <PanelCard title="ドキュメント" action={<BookOpen className="text-muted-foreground size-4" />}>
            <ul className="space-y-2 text-sm">
              {docs.map((d) => (
                <li key={d.path} className="flex items-center justify-between gap-2">
                  <span>{d.title}</span>
                  <code className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[11px]">{d.path}</code>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              {external.map((l) => (
                <Button key={l.href} asChild variant="outline" size="sm">
                  <a href={l.href} target="_blank" rel="noreferrer">{l.title}<ExternalLink /></a>
                </Button>
              ))}
            </div>
          </PanelCard>
        </div>
      </div>
    </>
  );
}
