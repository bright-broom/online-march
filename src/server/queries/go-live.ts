import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { demoEmailDomain, demoEmailDomains, isDemoEmail } from "@/config/demo";
import { paymentConfig, paymentMethodLabel } from "@/config/payments";
import { legalContent, legalDraft, type LegalDoc } from "@/config/content";
import { siteConfig } from "@/config/site";
import { db } from "@/db";
import { jobRuns, user } from "@/db/schema";
import { toYmd } from "@/lib/dates";
import { env, features, siteUrl } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { jobs, type JobName } from "@/server/jobs";

export type GoLiveCheck = {
  key: string;
  label: string;
  /** "ready" = 公開してよい / "blocker" = 直さないと公開できない / "warning" = 公開はできるが要確認 */
  state: "ready" | "blocker" | "warning";
  detail: string;
};

/**
 * 利用規約・プライバシーポリシーが正式版か。下書き表示（legalDraft）が残っている、または専門家確認待ちの
 * 【要確認】が本文に残っている間は公開できない。特商法の仮の値（下の "legal"）とは別に見る。
 */
export function checkLegalDocs(draft: boolean, docs: Record<string, LegalDoc>): Pick<GoLiveCheck, "state" | "detail"> {
  const pending = Object.values(docs)
    .flatMap((d) => [d.intro, ...d.sections.flatMap((sec) => [sec.heading, ...sec.body])])
    .filter((text) => text.includes("【要確認】")).length;
  if (!draft && !pending) return { state: "ready", detail: "正式版が掲載されています" };
  const reasons = [draft && "下書き表示のまま", pending && `専門家確認待ち（【要確認】）が${pending}か所`].filter(Boolean);
  return { state: "blocker", detail: `${reasons.join("・")}です（src/config/content.ts）` };
}

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


/** 最後に成功した日時を job ごとに引く（記録は残り続けるので直近200件で足りる） */
async function lastJobSuccess() {
  const rows = await db
    .select({ job: jobRuns.job, startedAt: jobRuns.startedAt })
    .from(jobRuns)
    .where(eq(jobRuns.status, "success"))
    .orderBy(desc(jobRuns.startedAt))
    .limit(200);
  const last = new Map<string, Date>();
  for (const r of rows) if (!last.has(r.job)) last.set(r.job, r.startedAt);
  return last;
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
    siteConfig.company.postalCode.endsWith("-0000") && "郵便番号",
    siteConfig.company.address.includes("番地は請求があれば") && "住所",
    Object.values(siteConfig.social).some((url) => /^https:\/\/[^/]+\/?$/.test(url)) && "SNSのリンク",
  ].filter(Boolean) as string[];

  const paymentMethods = await paymentMethodsCheck();
  const now = new Date();
  const lastSuccess = await lastJobSuccess();
  const staleJobs = (Object.keys(jobs) as JobName[]).filter((name) => {
    const last = lastSuccess.get(name);
    return !last || now.getTime() - last.getTime() > jobs[name].maxAgeHours * 3_600_000;
  });
  const lastBackup = lastSuccess.get("backup-db") ?? null;
  const backupStale = !lastBackup || now.getTime() - lastBackup.getTime() > 48 * 3_600_000;
  const [adminRow] = await db
    .select({ emails: sql<string[]>`coalesce(array_agg(${user.email}), '{}')` })
    .from(user)
    .where(eq(user.role, "admin"));
  const realAdmins = (adminRow?.emails ?? []).filter((e) => !isDemoEmail(e));
  const urlLooksLive = /^https:\/\//.test(siteUrl) && !/localhost|127\.0\.0\.1|example\./.test(siteUrl);

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
      label: "自動処理（Cron）",
      // 鍵があることと動いていることは別物。実行記録で見る
      state: !env.CRON_SECRET ? "blocker" : staleJobs.length ? "warning" : "ready",
      detail: !env.CRON_SECRET
        ? "CRON_SECRET が未設定です。本番では /api/cron/* が 503 を返します"
        : staleJobs.length
          ? `しばらく成功していない自動処理があります: ${staleJobs
              .map((n) => `${jobs[n].label}（${lastSuccess.get(n) ? `最終成功 ${toYmd(lastSuccess.get(n)!)}` : "実行記録なし"}）`)
              .join("・")}`
          : `${Object.keys(jobs).length}件すべて動いています`,
    },
    {
      key: "email",
      label: "メール送信",
      // 注文確認・返金のお知らせに加え、パスワード再設定もメールでしか届かない。送れないまま公開すると、
      // パスワードを忘れたお客さまは自力で戻れなくなるので blocker
      state: env.RESEND_API_KEY && !env.EMAIL_FROM.includes("example.com") ? "ready" : "blocker",
      detail: !env.RESEND_API_KEY
        ? "未設定です。注文確認・返金のお知らせ・パスワード再設定のメールが届きません"
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
      // トークンがあっても cron が落ちていれば取れていない。最後に取れた日時で見る
      state: !env.BACKUP_BLOB_READ_WRITE_TOKEN ? "warning" : backupStale ? "blocker" : "ready",
      detail: !env.BACKUP_BLOB_READ_WRITE_TOKEN
        ? "未設定です。非公開の Blob ストアを作り BACKUP_BLOB_READ_WRITE_TOKEN を設定すると、毎日自動保存します"
        : lastBackup
          ? `最後に取れたのは ${formatDateTime(lastBackup)}${backupStale ? "（48時間以上前です。/admin/automation で確認してください）" : ""}`
          : "まだ一度も取れていません。/admin/automation から「今すぐ実行」で確認してください",
    },
    {
      key: "admin-account",
      label: "運営アカウント",
      // デモ削除後に運営が誰も居ないと /admin に入れなくなる
      state: realAdmins.length ? "ready" : "blocker",
      detail: realAdmins.length
        ? `${realAdmins.join("・")}`
        : "デモ以外の運営アカウントがありません。会員登録したうえで `npm run admin:promote <メールアドレス>` を実行してください",
    },
    {
      key: "site-url",
      label: "サイトURL",
      // 決済の戻り先・メールのリンク・robots/sitemap がすべてこの値を使う
      state: urlLooksLive ? "ready" : "blocker",
      detail: urlLooksLive
        ? siteUrl
        : `${siteUrl} になっています。BETTER_AUTH_URL と NEXT_PUBLIC_SITE_URL に公開URL（https://…）を設定してください`,
    },
    {
      key: "search-index",
      label: "検索エンジンへの公開",
      // 準備中のサイトが本番データのように拾われないよう、公開条件が揃うまで noindex（src/app/robots.ts）
      state: "ready",
      detail: features.demo || !isLiveKey(env.STRIPE_SECRET_KEY)
        ? "準備中のため検索避け（noindex）にしています。デモモードを無効にし本番キーを設定すると自動で公開されます"
        : "検索エンジンに公開しています",
    },
    {
      key: "legal",
      label: "特定商取引法の表記・運営者情報",
      state: placeholders.length ? "blocker" : "ready",
      detail: placeholders.length ? `${placeholders.join("・")}が仮の値です（src/config/site.ts）` : "実データが設定されています",
    },
    { key: "legal-docs", label: "利用規約・プライバシーポリシー", ...checkLegalDocs(legalDraft, legalContent) },
  ];
}
