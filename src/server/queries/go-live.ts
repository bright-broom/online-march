import "server-only";
import { like, sql } from "drizzle-orm";
import { demoEmailDomain } from "@/config/demo";
import { siteConfig } from "@/config/site";
import { db } from "@/db";
import { user } from "@/db/schema";
import { env, features } from "@/lib/env";

export type GoLiveCheck = {
  key: string;
  label: string;
  /** "ready" = 公開してよい / "blocker" = 直さないと公開できない / "warning" = 公開はできるが要確認 */
  state: "ready" | "blocker" | "warning";
  detail: string;
};

const DEFAULT_AUTH_SECRET = "dev-secret-change-me-in-production-please";
const isLiveKey = (k?: string) => Boolean(k && (k.startsWith("sk_live_") || k.startsWith("rk_live_")));

/**
 * Go-live readiness for /admin/settings. Everything here is derived from env + data the platform already has,
 * so the operator can see what is still missing without reading docs/DEPLOY.md.
 */
export async function getGoLiveChecks(): Promise<GoLiveCheck[]> {
  const [demo] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(user)
    .where(like(user.email, `%@${demoEmailDomain}`));
  const demoAccounts = demo?.n ?? 0;
  const placeholders = [
    siteConfig.company.representative.includes("要設定") && "代表者名",
    siteConfig.contact.email.endsWith(".example") && "問い合わせメール",
    siteConfig.contact.phone.includes("00-0000") && "電話番号",
  ].filter(Boolean) as string[];

  return [
    {
      key: "stripe-key",
      label: "Stripe 本番キー",
      state: isLiveKey(env.STRIPE_SECRET_KEY) ? "ready" : "blocker",
      detail: !env.STRIPE_SECRET_KEY
        ? "未設定のためデモ決済で動作中です。本番キー（sk_live_…）を STRIPE_SECRET_KEY に設定してください"
        : isLiveKey(env.STRIPE_SECRET_KEY)
          ? "本番キーで動作しています"
          : "テストキー（sk_test_…）です。実際の決済は行われません",
    },
    {
      key: "stripe-webhooks",
      label: "Stripe Webhook の署名シークレット",
      state: env.STRIPE_WEBHOOK_SECRET && env.STRIPE_CONNECT_WEBHOOK_SECRET ? (env.STRIPE_ACCOUNTS_WEBHOOK_SECRET ? "ready" : "warning") : "blocker",
      detail: [
        env.STRIPE_WEBHOOK_SECRET ? "決済 ✓" : "決済 ✗（STRIPE_WEBHOOK_SECRET）",
        env.STRIPE_CONNECT_WEBHOOK_SECRET ? "連結アカウント ✓" : "連結アカウント ✗（STRIPE_CONNECT_WEBHOOK_SECRET）",
        env.STRIPE_ACCOUNTS_WEBHOOK_SECRET ? "Accounts v2 ✓" : "Accounts v2 ✗（STRIPE_ACCOUNTS_WEBHOOK_SECRET・推奨）",
      ].join(" / "),
    },
    {
      key: "demo-mode",
      label: "デモモード",
      state: features.demo ? "blocker" : "ready",
      detail: features.demo ? "ログイン画面にデモアカウントを表示中です。DEMO_MODE=false にしてください" : "無効です",
    },
    {
      key: "demo-accounts",
      label: "デモアカウント",
      state: demoAccounts === 0 ? "ready" : features.demo ? "warning" : "warning",
      detail:
        demoAccounts === 0
          ? "残っていません"
          : `@${demoEmailDomain} のアカウントが${demoAccounts}件あります。公開前に削除してください（デモモードが無効ならログインはできません）`,
    },
    {
      key: "auth-secret",
      label: "認証シークレット",
      state: env.BETTER_AUTH_SECRET === DEFAULT_AUTH_SECRET ? "blocker" : "ready",
      detail: env.BETTER_AUTH_SECRET === DEFAULT_AUTH_SECRET ? "開発用の既定値のままです。BETTER_AUTH_SECRET を設定してください" : "独自の値が設定されています",
    },
    {
      key: "cron",
      label: "自動処理の認証（Cron）",
      state: env.CRON_SECRET ? "ready" : "blocker",
      detail: env.CRON_SECRET ? "CRON_SECRET が設定されています" : "未設定です。本番では /api/cron/* が 503 を返します",
    },
    {
      key: "email",
      label: "メール送信",
      state: env.RESEND_API_KEY ? (env.EMAIL_FROM.includes("example.com") ? "warning" : "ready") : "warning",
      detail: !env.RESEND_API_KEY
        ? "未設定です。注文確認・出荷通知メールは送信されません"
        : env.EMAIL_FROM.includes("example.com")
          ? "EMAIL_FROM が例のままです。認証済みドメインのアドレスに変更してください"
          : `送信元 ${env.EMAIL_FROM}`,
    },
    {
      key: "blob",
      label: "画像アップロード",
      state: env.BLOB_READ_WRITE_TOKEN ? "ready" : "warning",
      detail: env.BLOB_READ_WRITE_TOKEN ? "Vercel Blob に接続済み" : "未設定です。生産者が写真を追加できません",
    },
    {
      key: "legal",
      label: "特定商取引法の表記・運営者情報",
      state: placeholders.length ? "blocker" : "ready",
      detail: placeholders.length ? `${placeholders.join("・")}が仮の値です（src/config/site.ts）` : "実データが設定されています",
    },
  ];
}
