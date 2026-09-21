import "server-only";
import { sql } from "drizzle-orm";
import { demoEmailDomain, demoEmailDomains } from "@/config/demo";
import { paymentConfig, paymentMethodLabel } from "@/config/payments";
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

/**
 * サイトが案内している決済手段が、Stripe 側でも実際に有効かを見る。
 * Checkout は `payment_method_types` を固定していない（= ダッシュボードの設定がそのまま出る）ので、
 * 「PayPay を有効にしたのに出ない」を運営画面だけで切り分けられるようにする。
 */
async function paymentMethodsCheck(): Promise<GoLiveCheck> {
  const base = { key: "payment-methods", label: "決済手段" } as const;
  if (!features.stripe) return { ...base, state: "warning", detail: "Stripe が未設定のため確認できません" };
  const advertised = paymentConfig.methods.filter((m) => m.listed);
  try {
    const { fetchEnabledPaymentMethods } = await import("@/server/services/payments/stripe");
    const enabled = new Set((await fetchEnabledPaymentMethods()).filter((m) => m.enabled).map((m) => m.id));
    const off = advertised.filter((m) => !enabled.has(m.id));
    const on = advertised.filter((m) => enabled.has(m.id));
    const names = (ids: { id: string }[]) => ids.map((m) => paymentMethodLabel(m.id)).join("・");
    if (off.length) {
      return {
        ...base,
        state: "warning",
        detail: `${names(off)} は Stripe 側で無効です（このアカウントで有効: ${names(on) || "なし"}）。ダッシュボードの「決済手段」で有効化すると、次のお支払いから表示されます`,
      };
    }
    return { ...base, state: "ready", detail: `${names(on)} が利用できます` };
  } catch (e) {
    return { ...base, state: "warning", detail: `Stripe から決済手段を取得できませんでした: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function getGoLiveChecks(): Promise<GoLiveCheck[]> {
  const [demo] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(user)
    .where(sql`lower(split_part(${user.email}, '@', 2)) = any(${sql.param(demoEmailDomains.map(String))})`);
  const demoAccounts = demo?.n ?? 0;
  const placeholders = [
    siteConfig.company.representative.includes("要設定") && "代表者名",
    siteConfig.contact.email.endsWith(".example") && "問い合わせメール",
    siteConfig.contact.phone.includes("00-0000") && "電話番号",
  ].filter(Boolean) as string[];

  const paymentMethods = await paymentMethodsCheck();

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
    paymentMethods,
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
      key: "backups",
      label: "データベースのバックアップ",
      state: env.BACKUP_BLOB_READ_WRITE_TOKEN ? "ready" : "warning",
      detail: env.BACKUP_BLOB_READ_WRITE_TOKEN
        ? "毎日、非公開の Blob ストアへ保存しています"
        : "未設定です。非公開の Blob ストアを作り BACKUP_BLOB_READ_WRITE_TOKEN を設定すると、毎日自動保存します",
    },
    {
      key: "legal",
      label: "特定商取引法の表記・運営者情報",
      state: placeholders.length ? "blocker" : "ready",
      detail: placeholders.length ? `${placeholders.join("・")}が仮の値です（src/config/site.ts）` : "実データが設定されています",
    },
  ];
}
